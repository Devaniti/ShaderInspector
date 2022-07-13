# Shader Inspector

This extension allows you to quickly compile shaders with DXC/FXC and check generated DXIL/DXBC

## Usage

1. Open HLSL file
2. Run "Shader Inspector: Compile Shader Interactively" command (keybind Alt+I)
3. Enter compilation parameters
4. (optional) When promted, agree to save shader declaration to shader file. This will allow you to skip manually entering all parameters later.
5. Observe compiled DXIL/DXBC listing, or compile error
6. (optional) Edit your shader and run "Shader Inspector: Repeat Last Compilation" command (keybind Shift+Alt+O) to skip manually entering all parameters and recompile
7. (optional) Repeat steps 1-5 for any additional shaders you may have in your file to save additional shader declarations for later use.

When you'll have shader declarations saved, just run "Shader Inspector: Compile Shader" command (keybind Alt+O)

## Requirements

You must have Windows SDK installed, or manually set compiler path in extension settings

## License

[MIT](LICENSE)
