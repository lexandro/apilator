// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dropdown } from './Dropdown';

afterEach(cleanup);

const options = [
  { value: 'none', label: 'No Auth' },
  { value: 'basic', label: 'Basic Auth' },
];

function setup() {
  const onChange = vi.fn();
  render(<Dropdown options={options} value="none" onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

describe('Dropdown', () => {
  it('selects an option clicked with the mouse', async () => {
    const { onChange, user } = setup();

    await user.click(screen.getByRole('button', { name: /No Auth/ }));
    await user.click(screen.getByRole('button', { name: 'Basic Auth' }));

    expect(onChange).toHaveBeenCalledWith('basic');
  });

  it('closes after a selection', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: /No Auth/ }));
    await user.click(screen.getByRole('button', { name: 'Basic Auth' }));

    expect(screen.queryByRole('button', { name: 'Basic Auth' })).toBeNull();
  });

  it('closes on a click outside without selecting', async () => {
    const { onChange, user } = setup();

    await user.click(screen.getByRole('button', { name: /No Auth/ }));
    await user.click(document.body);

    expect(screen.queryByRole('button', { name: 'Basic Auth' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
