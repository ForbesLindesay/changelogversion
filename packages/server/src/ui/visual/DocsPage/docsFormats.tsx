import React from 'react';

export function Heading({children}: {children: string}) {
  return <h2 className="font-poppins text-4xl">{children}</h2>;
}
export function Instruction({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return <h2 className={`font-sans text-3xl ${className}`}>{children}</h2>;
}
export function Details({children}: {children: React.ReactNode}) {
  return <p className="font-sans text-xl">{children}</p>;
}

export function InlineCode({children}: {children: React.ReactNode}) {
  return (
    <code className="font-mono text-base bg-gray-200 text-gray-900 ">
      {children}
    </code>
  );
}

export function CodeBlock({children}: {children: React.ReactNode}) {
  return (
    <pre className="bg-gray-200 py-4 block overflow-x-auto">
      <code className=" container mx-auto font-mono text-base text-gray-900 ml-2">
        {children}
      </code>
    </pre>
  );
}

export function CodeLine({
  children,
  indent = 0,
}: {
  children: React.ReactNode;
  indent?: number;
}) {
  return (
    <>
      {'  '.repeat(indent)}
      {children}
      {'\n'}
    </>
  );
}
export function CodePrefix({children}: {children: string}) {
  return <span className="text-orange-500">{children}</span>;
}
