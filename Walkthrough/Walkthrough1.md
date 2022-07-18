Shader declaration is a list of parameters for the shader compiler  
You can have multiple of them in a single file and edit them right in the text editor  
If you already have declaration in your shader file you can just compile your shader with Alt+O  
Example shader declaration:
```
/*
BEGIN_SHADER_DECLARATIONS
{
    "Shaders": [
        {
            "ShaderName": "DebugVS",
            "ShaderCompiler": "dxc",
            "ShaderType": "vs",
            "ShaderModel": "6_6",
            "EntryPoint": "vs_main",
            "Defines": [],
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
*/
```