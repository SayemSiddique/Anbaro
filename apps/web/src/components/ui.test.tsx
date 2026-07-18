import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button, StatePanel } from './ui';

describe('web primitives', () => {
  it('uses a native accessible button with a 44px target', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Save' }).style.minHeight).toBe('44px');
  });

  it('announces an error with text as well as an icon', () => {
    render(
      <StatePanel title="Couldn’t save" tone="error">
        Try again.
      </StatePanel>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Couldn’t save');
    expect(screen.getByText('Try again.')).toBeDefined();
  });
});
