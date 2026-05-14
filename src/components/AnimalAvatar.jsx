import React from 'react';

export default function AnimalAvatar({ type, color = '#ffffff', accent = '#334', className = '' }) {
  if (type === 'penguin') {
    return (
      <svg className={`animal-avatar ${className}`} viewBox="0 0 140 120" aria-hidden="true">
        <path d="M39 111c-22-15-28-48-13-75 12-22 31-31 49-27 20 4 35 23 39 50 4 29-8 49-28 56" fill="#f9fbff" stroke={accent} strokeWidth="5" />
        <path d="M33 68c-6-24 9-54 34-59 7 29 4 58-6 98-12 0-22-4-28-39Z" fill={accent} opacity=".9" />
        <path d="M109 68c6-24-9-54-34-59-7 29-4 58 6 98 12 0 22-4 28-39Z" fill={accent} opacity=".9" />
        <circle cx="55" cy="52" r="4" fill={accent} />
        <circle cx="85" cy="52" r="4" fill={accent} />
        <path d="M63 66c6 5 11 5 17 0" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />
        <path d="M62 60h17l-9 9Z" fill={color} stroke={accent} strokeWidth="4" />
      </svg>
    );
  }

  if (type === 'hedgehog') {
    return (
      <svg className={`animal-avatar ${className}`} viewBox="0 0 140 120" aria-hidden="true">
        <path d="M23 64 9 50l22-4-10-21 24 8 3-24 17 18L83 8l4 25 24-8-10 22 23 5-16 14 17 16-25 1 3 23-21-12-13 20-11-21-23 11 5-23-25-2Z" fill={color} stroke={accent} strokeWidth="5" strokeLinejoin="round" />
        <path d="M45 92c-9-9-7-25 5-34 14-10 35-9 45 2 10 11 8 29-5 38-13 10-33 7-45-6Z" fill="#fffdf7" stroke={accent} strokeWidth="5" />
        <circle cx="67" cy="73" r="4" fill={accent} />
        <circle cx="91" cy="73" r="4" fill={accent} />
        <path d="M76 88c5 3 11 3 16-1" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === 'hippo') {
    return (
      <svg className={`animal-avatar ${className}`} viewBox="0 0 140 120" aria-hidden="true">
        <path d="M28 58C28 30 47 14 70 14s42 16 42 44c13 4 19 14 16 28-4 18-24 27-58 27s-54-9-58-27c-3-14 3-24 16-28Z" fill={color} stroke={accent} strokeWidth="5" />
        <circle cx="37" cy="45" r="11" fill={color} stroke={accent} strokeWidth="5" />
        <circle cx="103" cy="45" r="11" fill={color} stroke={accent} strokeWidth="5" />
        <circle cx="55" cy="58" r="4" fill={accent} />
        <circle cx="85" cy="58" r="4" fill={accent} />
        <path d="M48 82c13 11 32 11 45 0" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" />
        <circle cx="58" cy="77" r="4" fill="#fffdf7" stroke={accent} strokeWidth="3" />
        <circle cx="82" cy="77" r="4" fill="#fffdf7" stroke={accent} strokeWidth="3" />
      </svg>
    );
  }

  return (
    <svg className={`animal-avatar ${className}`} viewBox="0 0 140 120" aria-hidden="true">
      <path d="M31 59c-12-18-6-42 10-49 11-4 24 3 29 17 6-14 20-21 31-17 16 7 22 31 10 49 8 28-8 54-41 54S23 87 31 59Z" fill={color} stroke={accent} strokeWidth="5" />
      <path d="M36 22c-20-7-30 7-25 28 17 3 30-7 25-28ZM104 22c20-7 30 7 25 28-17 3-30-7-25-28Z" fill="#fff8ea" stroke={accent} strokeWidth="5" />
      <circle cx="54" cy="61" r="4" fill={accent} />
      <circle cx="86" cy="61" r="4" fill={accent} />
      <path d="M65 75h10l-5 6Z" fill={accent} />
      <path d="M55 84c8 8 22 8 30 0" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
