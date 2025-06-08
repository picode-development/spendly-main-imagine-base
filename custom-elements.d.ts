// custom-elements.d.ts
declare namespace JSX {
  interface IntrinsicElements {
    'elevenlabs-convai': {
      'agent-id': string;
      key?: React.Key;
      ref?: React.Ref<HTMLElement>;
      className?: string;
      style?: React.CSSProperties;
      [key: string]: any;
    };
  }
}
