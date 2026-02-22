import React from 'react';

interface ProfileImageProps {
  src: string | undefined | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

export const ProfileImage: React.FC<ProfileImageProps> = ({ src, name, size = 'md', className = '' }) => {
  const initials = name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`rounded-full object-cover shrink-0 ${sizeClasses[size]} ${className}`}
      />
    );
  }

  return (
    <span
      className={`rounded-full bg-p2p-blue/20 text-p2p-blue flex items-center justify-center font-bold shrink-0 ${sizeClasses[size]} ${className}`}
    >
      {initials}
    </span>
  );
};
