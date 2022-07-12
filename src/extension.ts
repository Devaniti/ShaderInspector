// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { execFileSync } from 'child_process'
import * as vscode from 'vscode'

type ShaderDeclaration =
	{
		ShaderName: string
		ShaderCompiler: string | null
		ShaderType: string | null
		ShaderModel: string | null
		EntryPoint: string | null
		Defines: Array<string> | null
		Optimization: string | null
		AdditionalArgs: Array<string> | null
	}

type FileShaderDeclarations =
	{
		Shaders: Array<ShaderDeclaration>
	}

type ShaderCompilationData =
	{
		fileName: string
		shaderDeclaration: ShaderDeclaration
	}

interface ShaderQuickPick extends vscode.QuickPickItem {
	index: number
}

const shaderDeclarationRegexp: RegExp = /BEGIN_SHADER_DECLARATIONS(?<ShaderJson>.*)END_SHADER_DECLARATIONS/s
const winSDKSearchCommand = '((for /f "usebackq tokens=*" %i in (`"%ProgramFiles(x86)%/Microsoft Visual Studio/Installer/vswhere.exe" -latest -products * -property installationPath`) do (set VSDetectedDir=%i) && (call "%VSDetectedDir%/Common7/Tools/VsDevCmd.bat" > nul)) > nul) && (cmd /c echo %WindowsSdkVerBinPath%)'

let cachedWindowsSDKPath = ""

function GetWindowsSDKPath(): string {
	if (cachedWindowsSDKPath != "") return cachedWindowsSDKPath

	let outputText: string = ""
	try {
		let outputData: Buffer = execFileSync(winSDKSearchCommand, [], { shell: true })
		outputText = outputData.toString()
	}
	catch (err) {
		if (err instanceof Error) {
			outputText = err.message
		}
	}

	cachedWindowsSDKPath = outputText.trim()
	return cachedWindowsSDKPath
}

function GetSetting(settingName: string): string {
	return vscode.workspace.getConfiguration().get('DmytroBulatov.shaderinspector.' + settingName) ?? ""
}

function GetDXCPath(): string {
	let configPath: string = GetSetting('customDXCPath')
	if (configPath != null && configPath != "") return configPath
	return GetWindowsSDKPath() + "x64\\dxc.exe"
}

function GetFXCPath(): string {
	let configPath: string = GetSetting('customFXCPath')
	if (configPath != null && configPath != "") return configPath
	return GetWindowsSDKPath() + "x64\\fxc.exe"
}

function GetCompilerPath(shaderDeclaration: ShaderDeclaration): string {
	switch (shaderDeclaration.ShaderCompiler) {
		case "dxc": return GetDXCPath()
		case "fxc": return GetFXCPath()
		default: throw Error("Unknown shader compiler: " + shaderDeclaration.ShaderCompiler)
	}
}

function FillDefaultParameters(shaderDeclaration: ShaderDeclaration): ShaderDeclaration {
	if (shaderDeclaration.ShaderCompiler == null) shaderDeclaration.ShaderCompiler = GetSetting("shaderDefaults.shaderCompiler")
	if (shaderDeclaration.ShaderType == null) shaderDeclaration.ShaderType = GetSetting("shaderDefaults.shaderType")
	if (shaderDeclaration.ShaderModel == null) shaderDeclaration.ShaderModel = GetSetting("shaderDefaults.shaderModel")
	if (shaderDeclaration.EntryPoint == null) shaderDeclaration.EntryPoint = GetSetting("shaderDefaults.entryPoint")
	if (shaderDeclaration.Optimization == null) shaderDeclaration.Optimization = GetSetting("shaderDefaults.optimization")
	if (shaderDeclaration.AdditionalArgs == null) shaderDeclaration.AdditionalArgs = Array<string>()
	if (shaderDeclaration.Defines == null) shaderDeclaration.Defines = Array<string>()
	shaderDeclaration.AdditionalArgs.push(GetSetting("shaderDefaults.additionalArgs"))
	shaderDeclaration.Defines = shaderDeclaration.Defines.concat(GetSetting("shaderDefaults.defines").split(";").filter(e => e.length > 0))
	return shaderDeclaration
}

function ReplaceAll(str: string, subStr: string, replacement: string): string {
	return str.split(subStr).join(replacement)
}

function TextToHTML(text: string): string {
	// Copying text editor's font
	let fontSize = vscode.workspace.getConfiguration().get("editor.fontSize");
	let fontFamily = vscode.workspace.getConfiguration().get("editor.fontFamily");
	let htmlHead: string =
		`<head><style>
body {
	font-family: ${fontFamily};
	font-size: ${fontSize}px;
}
</style></head>`
	let htmlBody: string = "<body>" + ReplaceAll(text, "\r\n", "<br>") + "</body>"
	let html: string = "<html>" + htmlHead + htmlBody + "</html>"
	return html
}

var lastCompiled: ShaderCompilationData | null = null;

function repeatLastCompilation(): void {
	if (lastCompiled == null)
		throw Error('Haven\'t compiled anything yet.')

	compileFileFromDeclaration(lastCompiled)
}

function compileFileFromDeclaration(toCompile: ShaderCompilationData): void {
	lastCompiled = toCompile

	toCompile.shaderDeclaration = FillDefaultParameters(toCompile.shaderDeclaration)

	let args: Array<string> =
		[
			"-nologo",
			"-T" + toCompile.shaderDeclaration.ShaderType + "_" + toCompile.shaderDeclaration.ShaderModel,
			"-O" + toCompile.shaderDeclaration.Optimization,
			toCompile.fileName
		]
	if (toCompile.shaderDeclaration.EntryPoint) args.push("-E" + toCompile.shaderDeclaration.EntryPoint)
	args = args.concat(toCompile.shaderDeclaration.Defines?.map(def => "-D" + def) ?? [])
	args = args.concat(toCompile.shaderDeclaration.AdditionalArgs?.filter(e => e != '') ?? [])
	let outputText: string = ""
	let compilerPath: string = GetCompilerPath(toCompile.shaderDeclaration)

	try {
		let outputData: Buffer = execFileSync(compilerPath, args)
		outputText = outputData.toString()
	}
	catch (err) {
		if (err instanceof Error) {
			outputText = err.message
		}
	}

	outputText = compilerPath + " " + args.join(" ") + "\r\n\r\n" + outputText

	let webview = vscode.window.createWebviewPanel(toCompile.shaderDeclaration.ShaderName, toCompile.shaderDeclaration.ShaderName, vscode.ViewColumn.One)
	webview.webview.html = TextToHTML(outputText)
}

function compileFileFromText(fullPath: string, shaderText: string): void {
	let shaderDeclarationMatch: RegExpMatchArray | null = shaderText.match(shaderDeclarationRegexp)
	if (shaderDeclarationMatch == null)
		throw Error('No shader declaration.')

	let shaderDeclarationJSONString: string | null = shaderDeclarationMatch.groups ? shaderDeclarationMatch.groups["ShaderJson"] : null
	if (shaderDeclarationJSONString == null)
		throw Error('Missing shader declaration regexp match group.')

	let shaderDeclaration: FileShaderDeclarations
	try {
		shaderDeclaration = JSON.parse(shaderDeclarationJSONString)
	}
	catch (err) {
		throw Error("Parsing shader declaration JSON failed: " + err)
	}

	if (shaderDeclaration.Shaders.length == 0)
		throw Error("Missing shader declarations.")

	if (shaderDeclaration.Shaders.length == 1)
		compileFileFromDeclaration({ fileName: fullPath, shaderDeclaration: shaderDeclaration.Shaders[0] })

	let shaderOptions: Array<ShaderQuickPick> = []
	let i: number = 0
	shaderDeclaration.Shaders.forEach((shader) => {
		let description: string = ""
		if (shader.ShaderCompiler) description += " | " + shader.ShaderCompiler
		if (shader.ShaderType) description += " | " + shader.ShaderType
		if (shader.ShaderModel) {
			if (shader.ShaderType) description += "_" + shader.ShaderModel
			else description += " | " + shader.ShaderModel
		}
		if (shader.EntryPoint) description += " | " + shader.EntryPoint
		if (shader.Defines?.length) description += " | " + shader.Defines?.join(" ")
		if (shader.AdditionalArgs?.length) description += " | " + shader.AdditionalArgs?.join(" ")
		if (shader.Optimization) description += " | -O" + shader.Optimization
		// Remove first separator from description beginning
		description = description.replace(" | ", "")
		shaderOptions.push({
			label: shader.ShaderName,
			description: description,
			index: i++
		})
	})

	vscode.window.showQuickPick(shaderOptions).then((selection) => {
		if (selection == null) {
			return
		}
		compileFileFromDeclaration({ fileName: fullPath, shaderDeclaration: shaderDeclaration.Shaders[selection.index] })
	})
}

function compileCurrentFile(): void {
	if (vscode.window.activeTextEditor == null)
		throw Error('No active text editor to compile code in.')

	if (vscode.window.activeTextEditor.document.languageId != 'hlsl')
		throw Error('Wrond document language. HLSL expected.')

	let shaderFileName: string = vscode.window.activeTextEditor.document.fileName
	let shaderCode: string = vscode.window.activeTextEditor.document.getText()

	compileFileFromText(shaderFileName, shaderCode)
}

const defaultDXCShaderDeclaration =
	`/*
BEGIN_SHADER_DECLARATIONS
{
	"Shaders": 
	[
		{
			"ShaderName": "SampleShader",
			"ShaderCompiler": "dxc",
			"ShaderType": "ps",
			"ShaderModel": "6_6",
			"EntryPoint": "main",
			"Defines": [
				"SampleDefine"
				],
			"Optimization": "3",
			"AdditionalArgs": [
				"-HV 2018",
				"-all-resources-bound",
				"-enable-16bit-types"
				]
		}
	]
}
END_SHADER_DECLARATIONS
*/`

const defaultFXCShaderDeclaration =
	`/*
BEGIN_SHADER_DECLARATIONS
{
	"Shaders": 
	[
		{
			"ShaderName": "SampleShader",
			"ShaderCompiler": "fxc",
			"ShaderType": "ps",
			"ShaderModel": "5_0",
			"EntryPoint": "main",
			"Defines": [
				"SampleDefine"
				],
			"Optimization": "3",
			"AdditionalArgs": []
		}
	]
}
END_SHADER_DECLARATIONS
*/`

function addShaderDeclaration(): void {
	if (vscode.window.activeTextEditor == null)
		throw Error('No active text editor to add shader declaration to.')

	if (vscode.window.activeTextEditor.document.languageId != 'hlsl')
		throw Error('Wrond document language. HLSL expected.')

	let shaderDeclarationMatch = vscode.window.activeTextEditor.document.getText().match(shaderDeclarationRegexp)
	if (shaderDeclarationMatch != null)
		throw Error('File already has shader declaration.')

	let editor = vscode.window.activeTextEditor

	vscode.window.showQuickPick(["fxc", "dxc"]).then((selection) => {
		if (selection == null)
			return

		let declarationToPut: string = ""

		switch (selection) {
			case "dxc": declarationToPut = defaultDXCShaderDeclaration
				break;
			case "fxc": declarationToPut = defaultFXCShaderDeclaration
				break;
			default: throw Error("Unexpected selection in addShaderDeclaration: " + selection)
		}

		editor.edit(editBuilder => {
			editBuilder.insert(new vscode.Position(0, 0), declarationToPut);
		});
	})
}

function wrapErrorHandler(func: () => void): void {
	try {
		func()
	}
	catch (err) {
		if (err instanceof Error) {
			vscode.window.showErrorMessage(err.message)
		}
	}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('shaderinspector.compileShader', () => {
		wrapErrorHandler(compileCurrentFile)
	}))

	context.subscriptions.push(vscode.commands.registerCommand('shaderinspector.repeatLastCompilation', () => {
		wrapErrorHandler(repeatLastCompilation)
	}))

	context.subscriptions.push(vscode.commands.registerCommand('shaderinspector.addShaderDeclaration', () => {
		wrapErrorHandler(addShaderDeclaration)
	}))
}

// this method is called when your extension is deactivated
export function deactivate() { }
