import logoSrc from "@assets/nestwork_logo_centered.png";

interface LogoProps {
  className?: string;
  size?: number;
}

export function NestworkLogo({ className = "", size = 32 }: LogoProps) {
  return (
    <img
      src={logoSrc}
      alt="Nestwork"
      width={size}
      height={size}
      className={`rounded-md ${className}`}
      style={{ objectFit: "contain" }}
    />
  );
}
