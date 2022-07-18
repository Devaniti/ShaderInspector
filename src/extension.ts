// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { execFileSync, ExecFileSyncOptions } from 'child_process'
import { platform, tmpdir } from 'os'
import { unlinkSync, writeFileSync } from 'fs'
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
		textEditor: vscode.TextEditor
		shaderDeclaration: ShaderDeclaration
	}

interface ShaderQuickPick extends vscode.QuickPickItem {
	index: number
}

function IsWindows(): boolean {
	return platform() === 'win32'
}

function IsMacOS(): boolean {
	return platform() === 'darwin'
}

const executableExtension = IsWindows() ? ".exe" : ""

const shaderDeclarationRegexp: RegExp = /BEGIN_SHADER_DECLARATIONS(?<ShaderJson>.*)END_SHADER_DECLARATIONS/s

let cachedWindowsSDKPath = ""
let outputWindow: vscode.WebviewPanel | null = null

async function WrapExec(title: string, command: string, args?: Array<string>, options?: ExecFileSyncOptions): Promise<string> {
	return await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: title }, async () => {
		return execFileSync(command, args, options).toString()
	})
}

function GetSetting(settingName: string): string {
	return vscode.workspace.getConfiguration().get('DmytroBulatov.shaderinspector.' + settingName) ?? ""
}

function GetExtensionPath(): string {
	return vscode.extensions.getExtension("DmytroBulatov.shaderinspector")?.extensionPath ?? ""
}

async function GetWindowsSDKPath(): Promise<string> {
	if (!IsWindows()) return ""

	if (cachedWindowsSDKPath != "") return cachedWindowsSDKPath

	let outputText: string = ""
	try {
		let extensionPath = GetExtensionPath()
		outputText = await WrapExec("Searching for windows SDK.", extensionPath + "/FindWindowsSDK.bat")
	}
	catch (err) {
		if (err instanceof Error) {
			outputText = err.message
		}
	}

	cachedWindowsSDKPath = outputText.trim()
	return cachedWindowsSDKPath
}

function GetVulkanSDK(): string {
	if (IsMacOS())
		return process.env.VULKAN_SDK ? process.env.VULKAN_SDK + "/macOS/bin" : ""
	return process.env.VULKAN_SDK ? process.env.VULKAN_SDK + "/bin" : ""
}

async function GetDXCPath(): Promise<string> {
	let configPath: string = GetSetting('customDXCPath')
	if (configPath != null && configPath != "") return configPath
	let winSDKPath = await GetWindowsSDKPath()
	if (winSDKPath != "") return winSDKPath + "x64/dxc" + executableExtension
	let vulkanSDKPath = GetVulkanSDK()
	if (vulkanSDKPath != "") return vulkanSDKPath + "/dxc" + executableExtension
	throw Error("Cannot automatically find DXC. Please specify DXC path in settings.")
}

async function GetFXCPath(): Promise<string> {
	let configPath: string = GetSetting('customFXCPath')
	if (configPath != null && configPath != "") return configPath
	let winSDKPath = await GetWindowsSDKPath()
	if (winSDKPath != "") return winSDKPath + "x64/fxc" + executableExtension
	throw Error("Cannot automatically find FXC. Please specify FXC path in settings.")
}

async function GetCompilerPath(shaderDeclaration: ShaderDeclaration): Promise<string> {
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
	let htmlBody: string = "<body>" + ReplaceAll(ReplaceAll(text, "\r\n", "<br>"), "\n", "<br>") + "</body>"
	let html: string = "<html>" + htmlHead + htmlBody + "</html>"
	return html
}

var lastCompiled: ShaderCompilationData | null = null;

async function repeatLastCompilation(): Promise<void> {
	if (lastCompiled == null)
		throw Error('Haven\'t compiled anything yet.')

	return compileFileFromDeclaration(lastCompiled)
}

async function compileFileFromDeclaration(toCompile: ShaderCompilationData): Promise<void> {

	let tmpFile: string = ""
	let fileName: string = ""

	if (toCompile.textEditor.document.isUntitled) {
		tmpFile = tmpdir() + "/ShaderInspector.hlsl"
		writeFileSync(tmpFile, toCompile.textEditor.document.getText())
		fileName = tmpFile
	}
	else {
		let saved = toCompile.textEditor.document.save()
		if (!saved) {
			vscode.window.showWarningMessage("Failed to save the file before compilation")
		}
		fileName = toCompile.textEditor.document.fileName
	}

	lastCompiled = toCompile

	toCompile.shaderDeclaration = FillDefaultParameters(toCompile.shaderDeclaration)

	let args: Array<string> =
		[
			"-nologo",
			"-T" + toCompile.shaderDeclaration.ShaderType + "_" + toCompile.shaderDeclaration.ShaderModel,
			"-O" + toCompile.shaderDeclaration.Optimization,
			fileName
		]
	if (toCompile.shaderDeclaration.EntryPoint) args.push("-E" + toCompile.shaderDeclaration.EntryPoint)
	args = args.concat(toCompile.shaderDeclaration.Defines?.map(def => "-D" + def) ?? [])
	args = args.concat(toCompile.shaderDeclaration.AdditionalArgs?.filter(e => e != '') ?? [])
	let outputText: string = ""
	let compilerPath: string = await GetCompilerPath(toCompile.shaderDeclaration)

	try {
		outputText = await WrapExec("Compiling shader.", compilerPath, args)
	}
	catch (err) {
		if (err instanceof Error) {
			outputText = err.message
		}
	}

	if (tmpFile != "") {
		unlinkSync(tmpFile)
	}

	outputText = compilerPath + " " + args.join(" ") + "\r\n\r\n" + outputText

	if (outputWindow == null) {
		outputWindow = vscode.window.createWebviewPanel(toCompile.shaderDeclaration.ShaderName, toCompile.shaderDeclaration.ShaderName, vscode.ViewColumn.One)
		outputWindow.onDidDispose(() => {
			outputWindow = null
		})
	}
	else
	{
		outputWindow.reveal()
	}

	outputWindow.webview.html = TextToHTML(outputText)
}

async function compileFileInteractive(): Promise<void> {
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

	let shaderCompiler = await vscode.window.showQuickPick(compilerOptions, { title: 'Shader Compiler' })
	if (shaderCompiler == undefined) return
	shaderDeclaration.ShaderCompiler = shaderCompiler

	let shaderType = await vscode.window.showInputBox({ title: 'Shader Type', value: GetSetting('shaderDefaults.shaderType') })
	if (shaderType == undefined) return
	shaderDeclaration.ShaderType = shaderType

	let shaderModel = await vscode.window.showInputBox({ title: 'Shader Model', value: GetSetting('shaderDefaults.shaderModel') })
	if (shaderModel == undefined) return
	shaderDeclaration.ShaderModel = shaderModel

	let entryPoint = await vscode.window.showInputBox({ title: 'EntryPoint', value: GetSetting('shaderDefaults.entryPoint') })
	if (entryPoint == undefined) return
	shaderDeclaration.EntryPoint = shaderDeclaration.ShaderName = entryPoint

	let defines = await vscode.window.showInputBox({ title: 'Defines (separated by ";")' })
	if (defines == undefined) return
	shaderDeclaration.Defines = defines.split(';').filter(e => e.length > 0)

	let optimization = await vscode.window.showInputBox({ title: 'Optimization level (0-3)', value: GetSetting('shaderDefaults.optimization') })
	if (optimization == undefined) return
	shaderDeclaration.Optimization = optimization

	let additionalArgs = await vscode.window.showInputBox({ title: 'Additional Args (separated by " ")' })
	if (additionalArgs == undefined) return
	shaderDeclaration.AdditionalArgs = additionalArgs.split(" ").filter(e => e.length > 0)
	let defaultBehaviour = GetSetting('addShaderDeclarationsOnInteractiveCompile')
	let addDeclarationOptions = defaultBehaviour == 'true' ? ['yes', 'no'] : ['no', 'yes']

	let needAdd = await vscode.window.showQuickPick(addDeclarationOptions, { title: 'Add shader declaration to shader file' })
	if (needAdd == 'yes') {
		addShaderDeclaration(textEditor, shaderDeclaration)
	}

	return compileFileFromDeclaration({ textEditor: textEditor, shaderDeclaration: shaderDeclaration })
}

async function compileFileFromText(textEditor: vscode.TextEditor): Promise<void> {
	let shaderText = textEditor.document.getText()

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
		return compileFileFromDeclaration({ textEditor: textEditor, shaderDeclaration: shaderDeclaration.Shaders[0] })

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

	return vscode.window.showQuickPick(shaderOptions).then((selection) => {
		if (selection == null) {
			return
		}
		return compileFileFromDeclaration({ textEditor: textEditor, shaderDeclaration: shaderDeclaration.Shaders[selection.index] })
	})
}

async function compileCurrentFile(): Promise<void> {
	if (vscode.window.activeTextEditor == null)
		throw Error('No active text editor to compile code in.')

	if (vscode.window.activeTextEditor.document.languageId != 'hlsl')
		throw Error('Wrond document language. HLSL expected.')

	return compileFileFromText(vscode.window.activeTextEditor)
}

async function wrapErrorHandler(func: () => Promise<void>): Promise<void> {
	return func().catch(err => {
		if (err instanceof Error) {
			vscode.window.showErrorMessage(err.message)
		}
	})
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('shaderinspector.compileShader', () => {
		return wrapErrorHandler(compileCurrentFile)
	}))

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('shaderinspector.compileShaderInteractive', () => {
		return wrapErrorHandler(compileFileInteractive)
	}))

	context.subscriptions.push(vscode.commands.registerCommand('shaderinspector.repeatLastCompilation', () => {
		return wrapErrorHandler(repeatLastCompilation)
	}))
}

// this method is called when your extension is deactivated
export function deactivate() { }
