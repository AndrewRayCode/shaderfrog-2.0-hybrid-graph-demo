# Shaderfrog 2.0 "Hybrid Graph" Experimental Editor

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
