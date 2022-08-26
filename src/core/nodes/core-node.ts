export type InputCategory = 'data' | 'code';

export interface NodeInput {
  name: string;
  id: string;
  category: InputCategory;
  bakeable: boolean;
  property?: string;
}
export const nodeInput = (
  name: string,
  id: string,
  category: InputCategory,
  bakeable: boolean,
  property?: string
): NodeInput => ({
  name,
  id,
  category,
  bakeable,
  property,
});

export interface NodeOutput {
  name: string;
  id: string;
  category: InputCategory;
}

export interface CoreNode {
  id: string;
  name: string;
  type: string;
  inputs: NodeInput[];
  outputs: NodeOutput[];
}
