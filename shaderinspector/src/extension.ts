// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { execFileSync } from 'child_process'
import * as vscode from 'vscode'

type ShaderDeclaration =
	{
		ShaderName: string
		ShaderType: string
		ShaderModel: string
		EntryPoint: string | null
		Defines: Array<string>
		Optimization: string
		AdditionalArgs: Array<string>
	}

type FileShaderDeclarations =
	{
		Shaders: Array<ShaderDeclaration>
	}

interface ShaderQuickPick extends vscode.QuickPickItem {
	Shader: ShaderDeclaration
}

function IsDXCAvailable(): boolean {
	try {
		execFileSync("dxc", ["--help"])
	}
	catch (err) {
		return false
	}
	return true
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

function compileFileFromDeclaration(fullPath: string, shaderDeclaration: ShaderDeclaration): void {
	let tempDir: string | null = process.env["tmp"] ?? null

	if (tempDir == null) {
		vscode.window.showErrorMessage('Can\'t get temp directory')
		return
	}

	let args: Array<string> =
		[
			"-nologo",
			"-T " + shaderDeclaration.ShaderType + "_" + shaderDeclaration.ShaderModel,
			"-O" + shaderDeclaration.Optimization,
			fullPath
		]
	if (shaderDeclaration.EntryPoint) args.push("-E " + shaderDeclaration.EntryPoint)
	args = args.concat(shaderDeclaration.Defines.map(def => "-D" + def))
	args = args.concat(shaderDeclaration.AdditionalArgs)
	let outputText: string = ""

	try {
		let outputData: Buffer = execFileSync("dxc", args)
		outputText = outputData.toString()
	}
	catch (err) {
		if (err instanceof Error) {
			outputText = err.message
		}
	}

	let webview = vscode.window.createWebviewPanel(shaderDeclaration.ShaderName, shaderDeclaration.ShaderName, vscode.ViewColumn.One)
	webview.webview.html = TextToHTML(outputText)
}

function compileFileFromText(fullPath: string, shaderText: string): void {
	let shaderDeclarationRegexp: RegExp = /BEGIN_SHADER_DECLARATIONS(?<ShaderJson>.*)END_SHADER_DECLARATIONS/s
	let shaderDeclarationMatch: RegExpMatchArray | null = shaderText?.match(shaderDeclarationRegexp)
	if (shaderDeclarationMatch == null) {
		vscode.window.showErrorMessage('No shader declaration')
		return
	}
	let shaderDeclarationJSONString: string | null = shaderDeclarationMatch.groups ? shaderDeclarationMatch.groups["ShaderJson"] : null
	if (shaderDeclarationJSONString == null) {
		vscode.window.showErrorMessage('Missing shader declaration regexp match group')
		return
	}
	let shaderDeclaration: FileShaderDeclarations
	try {
		shaderDeclaration = JSON.parse(shaderDeclarationJSONString)
	}
	catch (err) {
		vscode.window.showErrorMessage("Parsing shader declaration JSON failed: " + err)
		return
	}

	if (shaderDeclaration.Shaders.length == 0) {
		vscode.window.showErrorMessage("Missing shader declarations")
	}

	if (shaderDeclaration.Shaders.length == 1) {
		compileFileFromDeclaration(fullPath, shaderDeclaration.Shaders[0])
	}

	let shaderOptions: Array<ShaderQuickPick> = []
	shaderDeclaration.Shaders.forEach((shader) => {
		let description: string = shader.ShaderType + "_" + shader.ShaderModel
		if (shader.EntryPoint != null) description += " | " + shader.EntryPoint
		if (shader.Defines.length != 0) description += " | " + shader.Defines.join(" ")
		if (shader.AdditionalArgs.length != 0) description += " | " + shader.AdditionalArgs.join(" ")
		description += " | -O" + shader.Optimization
		shaderOptions.push({
			label: shader.ShaderName,
			description: description,
			Shader: shader
		})
	})

	vscode.window.showQuickPick(shaderOptions).then((selection) => {
		if (selection == null) {
			return
		}
		compileFileFromDeclaration(fullPath, selection.Shader)
	})
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	if (!IsDXCAvailable()) {
		vscode.window.showInformationMessage('DXC is not in PATH. ShaderInspector won\'t work.')
	}

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('shaderinspector.buildWithDXC', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		if (vscode.window.activeTextEditor == null) {
			vscode.window.showErrorMessage('No active text editor to compile code in')
			return
		}

		let shaderFileName: string = vscode.window.activeTextEditor.document.fileName
		let shaderCode: string = vscode.window.activeTextEditor.document.getText()

		compileFileFromText(shaderFileName, shaderCode)
	})

	context.subscriptions.push(disposable)
}

// this method is called when your extension is deactivated
export function deactivate() { }
