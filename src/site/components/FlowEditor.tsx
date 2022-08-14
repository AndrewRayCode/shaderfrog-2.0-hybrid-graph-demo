import React, { useCallback, useRef, MouseEvent, forwardRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import ConnectionLine from './flow/ConnectionLine';
import create from 'zustand';

import ReactFlow, {
  Background,
  BackgroundVariant,
  useReactFlow,
  XYPosition,
  ReactFlowProps,
} from 'react-flow-renderer';

import { NodeType } from '../../core/graph';
import { EngineNodeType } from '../../core/engine';
import FlowEdgeComponent from './flow/FlowEdge';
import { DataNodeComponent, SourceNodeComponent } from './flow/FlowNode';
import { GraphDataType } from '../../core/nodes/data-nodes';
import { FlowEventHack } from '../flowEventHack';

import ctxStyles from './context.menu.module.css';

/**
 * This file is an attempt to break up Editor.tsx by abstracting out the view
 * implementaiton of FlowEditor. Any visual / non-graph functionality inside
 * the graph editor is meant to go in here.
 *
 * The menu and the mouse position need input from the parent component. Right
 * now I pass the mouse as a mutable object and the menu position with zustand.
 * Maybe instead put both in zustand or pull it all up into the parent? I don't
 * want to cause a re-render on every mouse move which is why it's an object
 */

interface EditorStore {
  menuPosition: XYPosition | undefined;
  setMenuPosition: (p?: XYPosition) => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  menuPosition: undefined,
  setMenuPosition: (menuPosition) => set(() => ({ menuPosition })),
}));

const flowStyles = { height: '100vh', background: '#111' };

const nodeTypes: Record<NodeType | GraphDataType | EngineNodeType, any> = {
  toon: SourceNodeComponent,
  phong: SourceNodeComponent,
  physical: SourceNodeComponent,
  shader: SourceNodeComponent,
  output: SourceNodeComponent,
  binary: SourceNodeComponent,
  source: SourceNodeComponent,
  vector2: DataNodeComponent,
  vector3: DataNodeComponent,
  vector4: DataNodeComponent,
  mat2: DataNodeComponent,
  mat3: DataNodeComponent,
  mat4: DataNodeComponent,
  mat2x2: DataNodeComponent,
  mat2x3: DataNodeComponent,
  mat2x4: DataNodeComponent,
  mat3x2: DataNodeComponent,
  mat3x3: DataNodeComponent,
  mat3x4: DataNodeComponent,
  mat4x2: DataNodeComponent,
  mat4x3: DataNodeComponent,
  mat4x4: DataNodeComponent,
  sampler2D: DataNodeComponent,
  number: DataNodeComponent,
  array: DataNodeComponent,
};

const edgeTypes = {
  special: FlowEdgeComponent,
};

export type MouseData = { real: XYPosition; projected: XYPosition };

type FlowEditorProps =
  | {
      mouse: MouseData;
      onNodeValueChange: (id: string, value: any) => void;
      onMenuAdd: (type: string) => void;
    } & Pick<
      ReactFlowProps,
      | 'nodes'
      | 'edges'
      | 'onConnect'
      | 'onEdgeUpdate'
      | 'onEdgesChange'
      | 'onNodesChange'
      | 'onNodesDelete'
      | 'onNodeDoubleClick'
      | 'onEdgesDelete'
      | 'onConnectStart'
      | 'onEdgeUpdateStart'
      | 'onEdgeUpdateEnd'
      | 'onConnectStop'
    >;

const FlowEditor = ({
  mouse,
  onMenuAdd,
  nodes,
  edges,
  onConnect,
  onEdgeUpdate,
  onEdgesChange,
  onNodesChange,
  onNodesDelete,
  onNodeDoubleClick,
  onEdgesDelete,
  onConnectStart,
  onEdgeUpdateStart,
  onEdgeUpdateEnd,
  onConnectStop,
  onNodeValueChange,
}: FlowEditorProps) => {
  const menuPos = useEditorStore((state) => state.menuPosition);
  const setMenuPos = useEditorStore((state) => state.setMenuPosition);

  useHotkeys('esc', () => setMenuPos());
  useHotkeys('shift+a', () => setMenuPos(mouse.real));

  const onContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      setMenuPos(mouse.real);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setMenuPos]
  );

  return (
    <div onContextMenu={onContextMenu}>
      {menuPos ? <ContextMenu position={menuPos} onAdd={onMenuAdd} /> : null}
      <FlowEventHack onChange={onNodeValueChange}>
        <ReactFlow
          style={flowStyles}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodes={nodes}
          edges={edges}
          onConnect={onConnect}
          onEdgeUpdate={onEdgeUpdate}
          onEdgesChange={onEdgesChange}
          onNodesChange={onNodesChange}
          onNodesDelete={onNodesDelete}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgesDelete={onEdgesDelete}
          connectionLineComponent={ConnectionLine}
          onConnectStart={onConnectStart}
          onEdgeUpdateStart={onEdgeUpdateStart}
          onEdgeUpdateEnd={onEdgeUpdateEnd}
          onConnectStop={onConnectStop}
        >
          <Background
            variant={BackgroundVariant.Lines}
            gap={25}
            size={0.5}
            color="#444444"
          />
        </ReactFlow>
      </FlowEventHack>
    </div>
  );
};

FlowEditor.displayName = 'FlowEditor';

const ctxNodes: [string, string][] = [
  ['fragment', 'Fragment'],
  ['vertex', 'Vertex'],
  ['number', 'Number'],
  ['vec2', 'Vector2'],
  ['vec3', 'Vector3'],
  ['vec4', 'Vector4'],
  ['add', 'Add'],
  ['multiply', 'Multiply'],
  ['phong', 'Phong'],
  ['toon', 'Toon'],
];
const ContextMenu = ({
  position,
  onAdd,
}: {
  onAdd: (name: string) => void;
  position: XYPosition;
}) => {
  return (
    <div
      id="x-context-menu"
      className={ctxStyles.contextMenu}
      style={{ top: position.y, left: position.x }}
    >
      <div className={ctxStyles.contextHeader}>Add a Node</div>
      {ctxNodes.map(([type, display]) => (
        <div
          key={type}
          className={ctxStyles.contextRow}
          onClick={() => onAdd(type)}
        >
          {display}
        </div>
      ))}
    </div>
  );
};

export default FlowEditor;
