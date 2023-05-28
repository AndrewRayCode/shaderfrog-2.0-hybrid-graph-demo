import React, { ReactNode } from 'react';
import classnames from 'classnames/bind';
import style from './tabs.module.css';
const cx = classnames.bind(style);

type TabbableChildProps = {
  selectedClassName: any;
  selected: any;
  onSelect: any;
  index: any;
};

// Overall wrapping component
const Tabs = ({
  children,
  selected,
  onSelect,
  selectedClassName,
}: {
  children: React.ReactNode;
  selectedClassName?: any;
  onSelect: (index: number) => void;
  selected: number;
}) => {
  return (
    <>
      {React.Children.map<ReactNode, ReactNode>(
        children,
        (child) =>
          React.isValidElement(child) &&
          React.cloneElement(child as React.ReactElement<TabbableChildProps>, {
            selectedClassName,
            selected,
            onSelect,
          })
      )}
    </>
  );
};

// Group of the tabs themselves
const TabGroup = ({
  children,
  selected,
  selectedClassName = 'tab_selected',
  onSelect,
  ...props
}: {
  children?: React.ReactNode;
  selected?: number;
  className?: string;
  selectedClassName?: string;
  onSelect?: Function;
}) => {
  return (
    <div {...props} className={cx('tab_tabs', props.className)}>
      {React.Children.map<ReactNode, ReactNode>(
        children,
        (child, index) =>
          React.isValidElement(child) &&
          React.cloneElement(child as React.ReactElement<TabbableChildProps>, {
            selectedClassName,
            selected,
            onSelect,
            index,
          })
      )}
    </div>
  );
};

// An individual tab
const Tab = ({
  children,
  selected,
  className,
  selectedClassName,
  onSelect,
  index,
  ...props
}: {
  children?: React.ReactNode;
  selected?: number;
  className?: any;
  selectedClassName?: any;
  onSelect?: Function;
  index?: number;
}) => {
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

// Wraps all panels, shows the selected panel
const TabPanels = ({
  selected,
  children,
}: {
  selected?: number;
  children: React.ReactNode;
}) => (
  <>
    {React.Children.map<ReactNode, ReactNode>(children, (child, index) =>
      selected === index ? child : null
    )}
  </>
);

// The contents for each tab
interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {}
const TabPanel = React.forwardRef<HTMLDivElement | null, TabPanelProps>(
  ({ children, ...props }, ref) => {
    return (
      <div ref={ref} {...props}>
        {children}
      </div>
    );
  }
);
TabPanel.displayName = 'TabPanel';

export { Tabs, Tab, TabGroup, TabPanels, TabPanel };
