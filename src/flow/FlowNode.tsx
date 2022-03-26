import React, { useEffect } from 'react';
import cx from 'classnames';
import {
  Handle,
  Position,
  Node as FlowNode,
  Edge as FlowEdge,
  HandleProps,
} from 'react-flow-renderer';
import { ShaderStage } from '../nodestuff';

import { useUpdateNodeInternals } from 'react-flow-renderer';

const handleTop = 40;
const textHeight = 10;
type NodeHandle = {
  validTarget: boolean;
  name: string;
};
export type FlowNodeData = {
  label: string;
  stage?: ShaderStage;
  /**
   * Whether or not this node can be used for both shader fragment and vertex
   */
  biStage: boolean;
  outputs: NodeHandle[];
  inputs: NodeHandle[];
};
type NodeProps = {
  id: string;
  data: FlowNodeData;
};

// interface NodeProp {
//   nodeId: string;
// }
// interface CustomHandleProps extends HandleProps, NodeProp {}

const CustomHandle = ({ nodeId, id, handleIndex, ...props }: any) => {
  // const updateNodeInternals = useUpdateNodeInternals();
  // useEffect(() => {
  //   // Hack for handle updating
  //   setTimeout(() => {
  //     updateNodeInternals(nodeId);
  //   }, 0);
  // }, [nodeId, updateNodeInternals, handleIndex, id]);

  return <Handle id={id} {...props} />;
};

const computeIOKey = (arr: NodeHandle[]) => arr.map((a) => a.name).join(',');

const CustomNodeComponent = ({ id, data }: NodeProps) => {
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
    <div
      className={cx('flownode', data.stage)}
      style={{
        height: `${handleTop + Math.max(data.inputs.length, 1) * 20}px`,
      }}
    >
      <div className="flowlabel">{data.label}</div>
      <div className="flowInputs">
        {data.inputs.map((input, index) => (
          <React.Fragment key={input.name}>
            <CustomHandle
              handleIndex={index}
              nodeId={id}
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
            <CustomHandle
              handleIndex={index}
              nodeId={id}
              id={output.name}
              className={cx({ validTarget: output.validTarget })}
              type="source"
              position={Position.Right}
              style={{ top: `${handleTop + index * 20}px` }}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default CustomNodeComponent;
