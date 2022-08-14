import { createContext, useContext } from 'react';

// Pass an onchange handler down to nodes in context

export const Context = createContext<any>({});
export type ChangeHandler = (id: string, value: any) => void;

export const useFlowEventHack = () => {
  return useContext(Context) as ChangeHandler;
};

export const FlowEventHack = ({
  onChange,
  children,
}: {
  onChange: ChangeHandler;
  children: React.ReactNode;
}) => {
  return <Context.Provider value={onChange}>{children}</Context.Provider>;
};
