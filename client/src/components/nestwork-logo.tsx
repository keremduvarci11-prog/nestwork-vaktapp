interface LogoProps {
  className?: string;
  size?: number;
}

export function NestworkLogo({ className = "", size = 32 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M50 5C50 5 15 25 15 55C15 75 30 95 50 95C70 95 85 75 85 55C85 25 50 5 50 5Z"
        fill="hsl(var(--primary))"
        stroke="hsl(var(--primary))"
        strokeWidth="2"
      />
      <path
        d="M50 10C50 10 75 30 78 55"
        stroke="hsl(var(--primary-foreground))"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.3"
        fill="none"
      />
      <text
        x="50"
        y="62"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="hsl(var(--primary-foreground))"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="38"
      >
        N
      </text>
    </svg>
  );
}