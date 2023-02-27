# Shaderfrog 2.0 "Hybrid Graph" Tech Demo

![Hybrid Graph editor screenshot](/public/hybrid-graph-screenshot.png)

# [Live Demo Link](http://frogger.andrewray.me/editor.html)

This is only a tech demo, and does not currently offer the ability to save shaders.

# What?

The Shaderfrog 2.0 "Hybrid Graph" editor is a tool that lets you arbitrarily
compose shader source code (GLSL) using a combination of source code and graph
nodes.

In the below screenshots, you can see a shader that produes a checkerboard
pattern. In a traditional graph editor, you need many nodes to reproduce the
math to create such a pattern. With the Hybird Graph, the entire checkerboard
shader is a single node, and you can edit its source code and modify its
uniforms. This hybrid editing creates a powerful and novel way to compose
effects together.

![Hybrid Graph editor screenshot](/public/checkerboard-graph.png)
![Hybrid Graph editor screenshot](/public/checkerboard-glsl.png)

# Engines (Three.js, Babylon, ...)

The hybrid graph is a GLSL editor, and is not specific to an engine. Engines are
implemented as [plugins](src/plugins/) to the hybrid graph. The same algorithm
of shader composing can in theory work with any GLSL based engine.

I've started with support for Three.js and Babylon.

# Implementation

The hybrid graph utilizes the compiler I wrote
[@Shaderfrog/glsl-parser](https://github.com/ShaderFrog/glsl-parser) which among
other things, exposed [a
bug](https://bugs.chromium.org/p/angleproject/issues/detail?id=6338#c1) in
Chrome's ANGLE compiler.

# State of this demo

This demo is a constant WIP. The main focus right now is on the UI/UX of the
graph editor and core APIs. There is currently no DX (developer experience),
meaning there is no way to export shaders to use in your own system, nor is there
a way to use the Hybrid Graph as a standalone library. (Yet!)

# Hacky Documentaiton

## How a RawShaderMaterial acts like a MeshPhysicalMaterial

1. The graph compiles all the nodes and sees there's a physical ndoe
2. It tells threngine to compile the megashader, which makes a new
   MeshPhysicalMaterial()
3. The properties of this material are based on the nodes in the graph, because
   to replace a "map" uniform, the material needs a "map" property so that the
   guts of three will add that uniform to the GLSL and then we can do the source
   code replcaement.
4. The material also gets specific properties set on the material, like
   isMeshStandardMaterial, which is a required switch
   (https://github.com/mrdoob/three.js/blob/e7042de7c1a2c70e38654a04b6fd97d9c978e781/src/renderers/webgl/WebGLMaterials.js#L42-L49)
   to get some uniforms on the material for example the transmissionRenderTarget
   which is a private variable of the WebGLRenderer
   (https://github.com/mrdoob/three.js/blob/e7042de7c1a2c70e38654a04b6fd97d9c978e781/src/renderers/WebGLRenderer.js#L1773)
5. Shaderfrog copies all the properties from the material onto the raw shader
   material. Properties like "transmission" are set with getters and need to be
   updated manually
6. The same needs to be done at runtime for uniforms, so "ior" needs to be set
   as a property of the runtime material, which explains why my material looked
   different when I set isMeshPhysicalMaterial = true, it started overwriting
   that uniform every render.

# Data Flow

## Initial Page Load

- On page load, the Graph is intialized from the URL param in Editor.tsx in
  `makeExampleGraph`
- Then the three scene mounts, which passes newly created context up to
  Editor.tsx
- This first generates the Flow Elements from the Graph using `graphToFlowGraph()`
- Then Editor.tsx calls `initializeGraph()`, which:
  - First computes context for the graph
  - Calls compileGraphAsync() which calls `compileGraph()` which processes the
    Graph
  - Graph elements are re-copied into Flow Elements using `setFlowElements()`
