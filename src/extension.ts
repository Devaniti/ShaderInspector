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

function addShaderDeclaration(textEditor: vscode.TextEditor, shaderDeclaration: ShaderDeclaration): void {
	let fileDeclaration: FileShaderDeclarations =
	{
		Shaders: [shaderDeclaration]
	}

	let declarationPosition: vscode.Position | vscode.Range = new vscode.Position(0, 0)
	let declarationExists: boolean = false

	let shaderDeclarationMatch: RegExpMatchArray | null = textEditor.document.getText().match(shaderDeclarationRegexp)
	if (shaderDeclarationMatch != null) {
		if (shaderDeclarationMatch.index == null)
			throw Error("Missing index property on RegExpMatch")
		let shaderDeclarationJSONString: string | null = shaderDeclarationMatch.groups ? shaderDeclarationMatch.groups["ShaderJson"] : null
		if (shaderDeclarationJSONString == null)
			throw Error('Missing shader declaration regexp match group.')
		try {
			fileDeclaration = JSON.parse(shaderDeclarationJSONString)
		}
		catch (err) {
			throw Error("Parsing shader declaration JSON failed: " + err)
		}

		declarationPosition = new vscode.Range(textEditor.document.positionAt(shaderDeclarationMatch.index), textEditor.document.positionAt(shaderDeclarationMatch.index + shaderDeclarationMatch[0].length))
		fileDeclaration.Shaders.push(shaderDeclaration)
		declarationExists = true
	}

	let tabSize: string = vscode.workspace.getConfiguration().get("editor.tabSize") ?? "4"

	let declarationToPut =
		`BEGIN_SHADER_DECLARATIONS
${JSON.stringify(fileDeclaration, null, tabSize)}
END_SHADER_DECLARATIONS`

	if (!declarationExists)
		declarationToPut =
			`/*
${declarationToPut}
*/

`

	textEditor.edit(editBuilder => {
		editBuilder.replace(declarationPosition, declarationToPut)
	});
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

function compileFileInteractive(): void {

	if (vscode.window.activeTextEditor == undefined)
		throw Error("No active text editor found")

	let textEditor = vscode.window.activeTextEditor

	let shaderDeclaration: ShaderDeclaration =
	{
		ShaderName: "Shader",
		ShaderCompiler: null,
		ShaderType: null,
		ShaderModel: null,
		EntryPoint: null,
		Defines: null,
		Optimization: null,
		AdditionalArgs: null
	}

	let defaultCompiler = GetSetting('shaderDefaults.shaderCompiler')
	let compilerOptions = defaultCompiler == 'dxc' ? ['dxc', 'fxc'] : ['fxc', 'dxc']

	vscode.window.showQuickPick(compilerOptions, { title: 'Shader Compiler' }).then(shaderCompiler => {
		if (shaderCompiler == undefined) return
		shaderDeclaration.ShaderCompiler = shaderCompiler
		vscode.window.showInputBox({ title: 'Shader Type', value: GetSetting('shaderDefaults.shaderType') }).then(shaderType => {
			if (shaderType == undefined) return
			shaderDeclaration.ShaderType = shaderType
			vscode.window.showInputBox({ title: 'Shader Model', value: GetSetting('shaderDefaults.shaderModel') }).then(shaderModel => {
				if (shaderModel == undefined) return
				shaderDeclaration.ShaderModel = shaderModel
				vscode.window.showInputBox({ title: 'EntryPoint', value: GetSetting('shaderDefaults.entryPoint') }).then(entryPoint => {
					if (entryPoint == undefined) return
					shaderDeclaration.EntryPoint = shaderDeclaration.ShaderName = entryPoint
					vscode.window.showInputBox({ title: 'Defines (separated by ";")' }).then(defines => {
						if (defines == undefined) return
						shaderDeclaration.Defines = defines.split(';').filter(e => e.length > 0)
						vscode.window.showInputBox({ title: 'Optimization level (0-3)', value: GetSetting('shaderDefaults.optimization') }).then(optimization => {
							if (optimization == undefined) return
							shaderDeclaration.Optimization = optimization
							vscode.window.showInputBox({ title: 'Additional Args (separated by " ")'}).then(additionalArgs => {
								if (additionalArgs == undefined) return
								shaderDeclaration.AdditionalArgs = additionalArgs.split(" ").filter(e => e.length > 0)
								let defaultBehaviour = GetSetting('addShaderDeclarationsOnInteractiveCompile')
								let addDeclarationOptions = defaultBehaviour == 'true' ? ['yes', 'no'] : ['no', 'yes']
								vscode.window.showQuickPick(addDeclarationOptions, { title: 'Add shader declaration to shader file' }).then(needAdd => {
									if (needAdd == 'yes') {
										addShaderDeclaration(textEditor, shaderDeclaration)
									}
									compileFileFromDeclaration({ fileName: textEditor.document.fileName, shaderDeclaration: shaderDeclaration })
								})
							})
						})
					})
				})
			})
		})
	})
}

function compileFileFromText(fullPath: string, shaderText: string): void {
	let shaderDeclarationMatch: RegExpMatchArray | null = shaderText.match(shaderDeclarationRegexp)
	if (shaderDeclarationMatch == null)
		return compileFileInteractive()

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

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('shaderinspector.compileShaderInteractive', () => {
		wrapErrorHandler(compileFileInteractive)
	}))

	context.subscriptions.push(vscode.commands.registerCommand('shaderinspector.repeatLastCompilation', () => {
		wrapErrorHandler(repeatLastCompilation)
	}))
}

// this method is called when your extension is deactivated
export function deactivate() { }
