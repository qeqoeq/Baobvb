import { ReactNode } from 'react';
import { Text, TextProps } from 'react-native';

type BaobabTextProps = TextProps & {
  children: ReactNode;
};

function BaobabText({ children, style, ...rest }: BaobabTextProps) {
  return (
    <Text style={[{ color: '#F2EDE8', fontSize: 18 }, style]} {...rest}>
      {children}
    </Text>
  );
}

export { BaobabText };
export default BaobabText;