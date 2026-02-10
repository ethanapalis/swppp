import React from 'react';

export default function NorthArrow() {
  return (
    <div className="north" aria-hidden>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="11" stroke="#111827" strokeWidth="1" fill="#fff"/>
        <path d="M12 4 L15 12 L12 10 L9 12 Z" fill="#111827"/>
        <text x="12" y="20" textAnchor="middle" fontSize="8" fill="#111827">N</text>
      </svg>
    </div>
  );
}
