import MonacoEditor, { Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { monacoGlsl } from './monaco-glsl';

import { Engine } from './graph';

type AnyFn = (...args: any) => any;

type MonacoProps<T> = {
  engine: Engine<T>;
  defaultValue: string;
  onChange: AnyFn;
  onSave: AnyFn;
};
const MonacoComponent = <T extends unknown>({
  engine,
  defaultValue,
  onChange,
  onSave,
}: MonacoProps<T>) => {
  const beforeMount = (monaco: Monaco) => {
    monaco.editor.defineTheme('myCustomTheme', {
      base: 'vs-dark', // can also be vs-dark or hc-black
      inherit: true, // can also be false to completely replace the builtin rules
      rules: [
        {
          token: 'comment',
          foreground: 'ffa500',
          fontStyle: 'italic underline',
        },
        { token: 'comment.js', foreground: '008800', fontStyle: 'bold' },
        { token: 'comment.css', foreground: '0000ff' }, // will inherit fontStyle from `comment` above
      ],
      colors: {
        'editor.background': '#000000',
      },
    });

    monacoGlsl(monaco);

    monaco.languages.registerCompletionItemProvider('glsl', {
      provideCompletionItems: (model, position) => {
        return {
          suggestions: [...engine.preserve.values()].map((keyword) => ({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Text,
            insertText: keyword,
            range: {
              startLineNumber: 0,
              endLineNumber: 0,
              startColumn: 0,
              endColumn: 0,
            },
          })),
        };
      },
    });
  };

  const onMount = (
    editor: monaco.editor.IStandaloneCodeEditor,
    monaco: Monaco
  ) => {
    editor.addAction({
      // An unique identifier of the contributed action.
      id: 'my-unique-id',

      // A label of the action that will be presented to the user.
      label: 'My Label!!!',

      // An optional array of keybindings for the action.
      // @ts-ignore https://github.com/suren-atoyan/monaco-react/issues/338
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S],

      // A precondition for this action.
      // precondition: null,

      // A rule to evaluate on top of the precondition in order to dispatch the keybindings.
      // keybindingContext: null,

      contextMenuGroupId: 'navigation',

      contextMenuOrder: 1.5,

      // Method that will be executed when the action is triggered.
      // @param editor The editor instance is passed in as a convenience
      run: function (ed: any) {
        console.log(
          'Monaco command-s run() called at editor position ' + ed.getPosition()
        );
        onSave();
      },
    });
  };

  return (
    <MonacoEditor
      height="100vh"
      language="glsl"
      theme="myCustomTheme"
      defaultValue={defaultValue}
      onChange={onChange}
      options={{
        minimap: { enabled: false },
      }}
      onMount={onMount}
      beforeMount={beforeMount}
    />
  );
};

export default MonacoComponent;
