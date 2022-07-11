# Shader Inspector

This extension allows you to quickly compile shaders with DXC and check generated DXIL

## Features

- Multiple shaders in one file
- Customizations of all compile params

## Usage

- Open HLSL file
- Run "Shader Inspector: Add shader declaration" command (keybind Alt+U)
- Fill your shader compile parameters in newly added shader declaration
- (optional) Duplicate shader declaration, and define more than 1 shader per file
- Run "Shader Inspector: Compile With DXC" command (keybind Alt+I)
- See DXIL shader listings in newly opened tab
- (optional) After changing your shader you can recompile it with "Shader Inspector: Repeat last compilation" command (keybind Alt+I)
  - It skips shader selection if you have multiple shader in one file
  - It also allows you to recompile shader when editing one of its header without switching files

## Requirements

You must have DXC available in PATH

## License

[MIT](LICENSE)
