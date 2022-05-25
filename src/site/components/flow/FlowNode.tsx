import React, { useEffect } from 'react';
import cx from 'classnames';
import {
  Handle,
  Position,
  Node as FlowNode,
  Edge as FlowEdge,
  HandleProps,
} from 'react-flow-renderer';
import { ShaderStage } from '../core/graph';

import { useUpdateNodeInternals } from 'react-flow-renderer';
import { GraphDataType } from '../core/nodes/data-nodes';
import { InputCategory } from '../core/nodes/core-node';

const handleTop = 45;
const textHeight = 10;
type NodeHandle = {
  validTarget: boolean;
  category?: InputCategory;
  name: string;
};

export interface CoreFlowNode {
  label: string;
  outputs: NodeHandle[];
  inputs: NodeHandle[];
}
export interface FlowNodeDataData extends CoreFlowNode {
  type: GraphDataType;
  value: any;
  onChange: (id: string, event: any) => void;
}
export interface FlowNodeSourceData extends CoreFlowNode {
  stage?: ShaderStage;
  active: boolean;
  /**
   * Whether or not this node can be used for both shader fragment and vertex
   */
  biStage: boolean;
  onToggle: (id: string, name: string) => void;
}
export type FlowNodeData = FlowNodeSourceData | FlowNodeDataData;

// interface NodeProp {
//   nodeId: string;
// }
// interface CustomHandleProps extends HandleProps, NodeProp {}

// const CustomHandle = ({ nodeId, id, handleIndex, ...props }: any) => {
//   // const updateNodeInternals = useUpdateNodeInternals();
//   // useEffect(() => {
//   //   // Hack for handle updating
//   //   setTimeout(() => {
//   //     updateNodeInternals(nodeId);
//   //   }, 0);
//   // }, [nodeId, updateNodeInternals, handleIndex, id]);

//   return <Handle id={id} {...props} />;
// };

// const computeIOKey = (arr: NodeHandle[]) => arr.map((a) => a.name).join(',');

const FlowWrap = ({
  children,
  data,
  className,
}: {
  children: React.ReactNode;
  data: FlowNodeData;
  className: any;
}) => (
  <div
    className={cx('flownode', className)}
    style={{
      height: `${handleTop + Math.max(data.inputs.length, 1) * 20}px`,
    }}
  >
    {children}
  </div>
);

const DataNodeComponent = ({
  id,
  data,
}: {
  id: string;
  data: FlowNodeDataData;
}) => {
  return (
    <FlowWrap data={data} className={data.type}>
      <div className="flowlabel">{data.label}</div>
      <div className="flowInputs">
        {data.inputs.map((input, index) => (
          <React.Fragment key={input.name}>
            <Handle
              id={input.name}
              className={cx({ validTarget: input.validTarget })}
              type="target"
              position={Position.Left}
              style={{ top: `${handleTop + index * 20}px` }}
            />
            <div
              className={cx('react-flow_handle_label', {
                validTarget: input.validTarget,
              })}
              style={{
                top: `${handleTop - textHeight + index * 20}px`,
                left: 15,
              }}
            >
              {input.name}
            </div>
          </React.Fragment>
        ))}

        <div className="body">
          <input
            className="nodrag"
            type="text"
            onChange={(e) => data.onChange(id, e)}
            value={data.value}
          />
        </div>

        {data.outputs.map((output, index) => (
          <React.Fragment key={output.name}>
            <div
              className="react-flow_handle_label"
              style={{
                top: `${handleTop - textHeight + index * 20}px`,
                right: 15,
              }}
            >
              {output.name}
            </div>
            <Handle
              id={output.name}
              className={cx({ validTarget: output.validTarget })}
              type="source"
              position={Position.Right}
              style={{ top: `${handleTop + index * 20}px` }}
            />
          </React.Fragment>
        ))}
      </div>
    </FlowWrap>
  );
};

const SourceNodeComponent = ({
  id,
  data,
}: {
  id: string;
  data: FlowNodeSourceData;
}) => {
  // const updateNodeInternals = useUpdateNodeInternals();
  // const key = `${computeIOKey(data.inputs)}${computeIOKey(data.outputs)}`;

  // useEffect(() => {
  //   console.log('Effect running', { id });
  //   updateNodeInternals(id);
  //   return () => {
  //     updateNodeInternals(id);
  //   };
  // }, [id, updateNodeInternals, key]);

  // TODO: can we make a test case react flow sandbox of chaning a node's
  // named inputs and handles and it failing?
  // console.log('rendering custom node component for ', data.label, data);
  return (
    <FlowWrap
      data={data}
      className={cx(data.stage, { inactive: !data.active })}
    >
      <div className="flowlabel">
        {data.label}
        {data.stage ? (
          <div className="stage">
            {data.stage === 'fragment' ? 'FRAG' : 'VERT'}
          </div>
        ) : null}
      </div>
      <div className="flowInputs">
        {data.inputs.map((input, index) => (
          <React.Fragment key={input.name}>
            <Handle
              id={input.name}
              className={cx({ validTarget: input.validTarget })}
              type="target"
              position={Position.Left}
              style={{ top: `${handleTop + index * 20}px` }}
            />
            <div
              className={cx('react-flow_handle_label', {
                validTarget: input.validTarget,
              })}
              style={{
                top: `${handleTop - textHeight + index * 20}px`,
                left: 15,
              }}
            >
              <div
                className="switch"
                onClick={(e) => (
                  e.preventDefault(), data.onToggle(id, input.name)
                )}
              >
                {input.category === 'data' ? '➡️' : '🔒'}
              </div>
              {input.name}
            </div>
          </React.Fragment>
        ))}

        {data.outputs.map((output, index) => (
          <React.Fragment key={output.name}>
            <div
              className="react-flow_handle_label"
              style={{
                top: `${handleTop - textHeight + index * 20}px`,
                right: 15,
              }}
            >
              {output.name}
            </div>
            <Handle
              id={output.name}
              className={cx({ validTarget: output.validTarget })}
              type="source"
              position={Position.Right}
              style={{ top: `${handleTop + index * 20}px` }}
            />
          </React.Fragment>
        ))}
      </div>

      <Handle
        id="from"
        className="next-stage-handle"
        type="source"
        position={Position.Right}
      />
      <Handle
        id="to"
        className="next-stage-handle"
        type="target"
        position={Position.Right}
      />
    </FlowWrap>
  );
};

export { DataNodeComponent, SourceNodeComponent };
