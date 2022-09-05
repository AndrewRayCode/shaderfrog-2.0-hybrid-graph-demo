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

## Data Flow: Frog Core Graph -> React Flow Graph

On load, we call initializeGraph -> initializeFlowElementsFromGraph, so data
flow is: graph is source of truth -> flow elements, and in there we set the
positions of elements haphazardly. This sets the source of truth as the frog
graph, which makes sense. Except for the positions. so the flow graph contains
some data that needs to be saved that's not in the nodes themselves.

Adding edge to graph: addConnection() creates a flow edge, then sets needcompile
to true, which calls compile(), which updates the graph using fromFlowToGraph(),
which copies flow edges into the graph, and copies "baked" and "value" onto the
graph node. So in this sense, any unsynced changes from the flow graph are
"committed" to the main graph.

From the core graph -> flow graph:
- New inputs from strategies
- Which nodes are "active" based on sibling IDs
- Which nodes are "data" but calculated in Editor not graph.ts (the core graph
  skips these to avoid filling data into properties/uniforms, and then Editor *
  recalculates *all* dataInputs from the core graph for colorizing and not
  recompiling on dragging sliders around.)

From the flow graph -> core graph:
- On baked toggle, sets the *flow* baked, then calls setDebouncedNeedsCompile()
- On data value change, which sets the flow elements with the new data to make
  controlled inputs, *and* updates the graph (why? probably doesn't need to)
  then calls setDebouncedNeedsCompile()
- onEdgesDelete updates flow elements, *and* removes the element from the core
  graph (and *doesn't* trigger a recompile, maybe should)
- Adding an edge calls addConnection(), which removes duplicate edges, then
  updates the *flow* graph, then calls setNeedsCompile()
