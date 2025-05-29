interface PresenceDotProps {
  isOnline: boolean;
  className?: string;
}

export default function PresenceDot({ isOnline, className = '' }: PresenceDotProps) {
  return (
    <div
      className={`w-2.5 h-2.5 rounded-full ${
        isOnline ? 'bg-green-500' : 'bg-gray-400'
      } ${className}`}
    />
  );
} 