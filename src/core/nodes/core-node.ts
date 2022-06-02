export type InputCategory = 'data' | 'code';

export interface NodeInput {
  name: string;
  id: string;
  category: InputCategory;
  bakeable: boolean;
}

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
