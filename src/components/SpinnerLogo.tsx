const GEMINI_URL = "https://static.vecteezy.com/system/resources/thumbnails/055/687/065/small_2x/gemini-google-icon-symbol-logo-free-png.png";

interface SpinnerLogoProps {
  size?: number;
  className?: string;
}

const SpinnerLogo = ({ size = 40, className = "" }: SpinnerLogoProps) => {
  return (
    <img
      src={GEMINI_URL}
      alt="Loading"
      width={size}
      height={size}
      className={`gemini-spin pointer-events-none select-none ${className}`}
      style={{ width: size, height: size, objectFit: "contain" }}
      draggable={false}
    />
  );
};

export default SpinnerLogo;