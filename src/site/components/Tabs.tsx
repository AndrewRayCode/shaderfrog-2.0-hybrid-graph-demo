import React, { ReactNode } from 'react';
import cx from 'classnames';

type TabsProps = {
  children: React.ReactNode;
  selectedClassName?: any;
  onSelect: Function;
  selected: number;
};
const Tabs = ({
  children,
  selected,
  onSelect,
  selectedClassName,
}: TabsProps) => {
  return (
    <>
      {React.Children.map<ReactNode, ReactNode>(
        children,
        (child) =>
          React.isValidElement(child) &&
          React.cloneElement(child, {
            selectedClassName,
            selected,
            onSelect,
          })
      )}
    </>
  );
};

type TabGroupProps = {
  children?: React.ReactNode;
  selected?: number;
  className?: string;
  selectedClassName?: string;
  onSelect?: Function;
};
const TabGroup = ({
  children,
  selected,
  selectedClassName = 'tab_selected',
  onSelect,
  ...props
}: TabGroupProps) => {
  return (
    <div {...props} className={cx('tab_tabs', props.className)}>
      {React.Children.map<ReactNode, ReactNode>(
        children,
        (child, index) =>
          React.isValidElement(child) &&
          React.cloneElement(child, {
            selectedClassName,
            selected,
            onSelect,
            index,
          })
      )}
    </div>
  );
};

type TabProps = {
  children?: React.ReactNode;
  selected?: number;
  className?: any;
  selectedClassName?: any;
  onSelect?: Function;
  index?: number;
};
const Tab = ({
  children,
  selected,
  className,
  selectedClassName,
  onSelect,
  index,
  ...props
}: TabProps) => {
  return (
    <div
      {...props}
      className={cx(className, 'tab_tab', {
        [selectedClassName]: selected === index,
      })}
      onClick={(event) => {
        event.preventDefault();
        onSelect && onSelect(index);
      }}
    >
      {children}
    </div>
  );
};

type TabPanelsProps = { selected?: number; children: React.ReactNode };
const TabPanels = ({ selected, children }: TabPanelsProps) => (
  <>
    {React.Children.map<ReactNode, ReactNode>(children, (child, index) =>
      selected === index ? child : null
    )}
  </>
);
interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {}
const TabPanel = ({ children, ...props }: TabPanelProps) => {
  return <div {...props}>{children}</div>;
};

export { Tabs, Tab, TabGroup, TabPanels, TabPanel };
