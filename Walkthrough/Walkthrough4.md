To compile shaders as SPIR-V, specify "-spirv" in the additional arguments  
You can add "-spirv" to "Additional Args" option in Shader Inspector's setting to always compile to SPIR-V  
Note that if you are compiling to SPIR-V you either need to install Vulkan SDK or specify DXC path manually  
Since DXC available in Windows SDK does not support SPIR-V  
For same reason we'll skip Widnows SDK's DXC when there's "-spirv" argument specified