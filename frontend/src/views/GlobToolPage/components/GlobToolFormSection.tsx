import { ReactNode, useState, useCallback, ChangeEvent } from 'react';
import picomatch from "picomatch";

import { TextArea, Button } from '@app/components/v2';

type Props = {
  path: string;
}

export const GlobToolFormSection = ( { path }: Props) => {
  const [glob, setGlob] = useState<string>('');
  const [output, setOutput] = useState<ReactNode>(null);

  const handleGlobChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setGlob(e.target.value);
  }, []);

  const validateStrings = useCallback((secret: string, testStrings: string) => {
    if (!secret || !testStrings) return;

    const matcher = picomatch(secret, { dot: true, ignore: '//' });
    const patterns = testStrings.split('\n');

    const newOutput = patterns.map((pattern) => {
      if (pattern.startsWith('//')) {
        return <div key={pattern}>{pattern}</div>
      }

      const isMatch = matcher(pattern);
      const color = isMatch ? 'text-green-500' : 'text-red-500';

      return (
        <div key={pattern} className={color}>
          {isMatch ? "✓" : "✕"} - {pattern}
        </div>
      )
    })

    setOutput(newOutput)
  }, []);

  return (
    <>
      <div className="flex flex-col gap-3">
        <p>Test Strings</p>
        <TextArea
          value={glob}
          onChange={handleGlobChange}
          rows={4}
        />
      </div>

      <div className="flex flex-col gap-3">
        <p>Output</p>
        <div style={{ minHeight: '6rem' }} className="rounded-md w-full overflow-y-auto p-2 border border-solid border-mineshaft-400 bg-bunker-800 text-gray-400 font-inter whitespace-pre-wrap">
          {output}
        </div>
      </div>

      <div>
        <Button
          variant="solid"
          type="button"
          onClick={() => validateStrings(path, glob)}
          className="mb-4"
        >
          Validate
        </Button>
      </div>
    </>
  )
}
