import { ReactNode } from 'react';
import { Text, TextProps } from 'react-native';

type MyTextProps = TextProps & {
  children: ReactNode;
};

export default function MyText({ children, style, ...rest }: MyTextProps) {
  return (
    <Text style={[{ color: '#F2EDE8', fontSize: 18 }, style]} {...rest}>
      {children}
    </Text>
  );
}