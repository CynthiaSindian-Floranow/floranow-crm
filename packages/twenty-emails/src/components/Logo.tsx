import { Img } from '@react-email/components';

const logoStyle = {
  marginBottom: '40px',
};

export const Logo = () => {
  return (
    <Img
      src="https://app.twenty.com/images/logo/floranow-mark.png"
      alt="Floranow logo"
      width="40"
      height="40"
      style={logoStyle}
    />
  );
};
