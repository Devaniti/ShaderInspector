# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Support for compiling shaders in unsaved text editor

### Changed
- Reusing shader output window to not spawn many windows
- Optimized Windows SDK searching

### Fixed 
- Fix DXC was always used as shader compiler

## [1.0.0] - 2022-07-16
### Added
- Progress indicator
- Fallback to VULKAN_SDK when searching for DXC
- macOS and Linux support (only DXC, Linux untested)

### Changed
- Better icon

## [0.0.2] - 2022-07-14
### Added
- FXC Support
- Interactive compilation
- Settings

### Changed
- Using compilers from Windows SDK instead of Vulkan SDF

## [0.0.1] - 2022-07-11
### Added
- Initial release

[Unreleased]: https://github.com/Devaniti/ShaderInspector/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Devaniti/ShaderInspector/compare/v0.0.2...v1.0.0
[0.0.2]: https://github.com/Devaniti/ShaderInspector/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/Devaniti/ShaderInspector/releases/tag/v0.0.1