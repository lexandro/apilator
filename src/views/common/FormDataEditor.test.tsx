// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormDataEditor, fileNameOf } from './FormDataEditor';
import { createFormDataEntry } from '../../domain';
import type { FormDataEntry } from '../../domain';

afterEach(cleanup);

function setup(items: FormDataEntry[], pickedPath: string | null = null) {
  const onChange = vi.fn();
  const onPickFile = vi.fn().mockResolvedValue(pickedPath);
  render(<FormDataEditor items={items} onChange={onChange} onPickFile={onPickFile} />);
  return { onChange, onPickFile, user: userEvent.setup() };
}

function textRow(key = 'title', value = 'hello'): FormDataEntry {
  return { ...createFormDataEntry(key, value), id: 'row-1' };
}

function fileRow(path = 'C:\\tmp\\report.pdf'): FormDataEntry {
  return { ...createFormDataEntry('upload', ''), id: 'row-1', filePath: path };
}

describe('fileNameOf', () => {
  it('takes the last segment of a Windows path', () => {
    expect(fileNameOf('C:\\Users\\me\\report.pdf')).toBe('report.pdf');
  });

  it('takes the last segment of a posix path', () => {
    expect(fileNameOf('/home/me/report.pdf')).toBe('report.pdf');
  });

  it('returns a bare name unchanged', () => {
    expect(fileNameOf('report.pdf')).toBe('report.pdf');
  });
});

describe('text rows', () => {
  it('renders the key and value', () => {
    setup([textRow()]);

    expect(screen.getByDisplayValue('title')).toBeDefined();
    expect(screen.getByDisplayValue('hello')).toBeDefined();
  });

  it('reports a key edit', async () => {
    const { onChange, user } = setup([textRow()]);

    await user.type(screen.getByDisplayValue('title'), '!');

    expect(onChange).toHaveBeenCalled();
    const [updated] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(updated[0].key).toBe('title!');
  });

  it('reports the enabled checkbox being cleared', async () => {
    const { onChange, user } = setup([textRow()]);

    await user.click(screen.getByLabelText('Enabled'));

    expect(onChange.mock.calls[0][0][0].enabled).toBe(false);
  });

  it('adds a row', async () => {
    const { onChange, user } = setup([textRow()]);

    await user.click(screen.getByText('+ Add field'));

    expect(onChange.mock.calls[0][0]).toHaveLength(2);
  });

  it('removes a row', async () => {
    const { onChange, user } = setup([textRow()]);

    await user.click(screen.getByTitle('Remove'));

    expect(onChange.mock.calls[0][0]).toEqual([]);
  });
});

describe('switching a row between text and file', () => {
  it('starts as a text row', () => {
    setup([textRow()]);

    expect(screen.getByTitle('Send as a file')).toBeDefined();
    expect(screen.queryByText('Choose file…')).toBeNull();
  });

  it('turns a text row into a file row and clears its value', async () => {
    const { onChange, user } = setup([textRow()]);

    await user.click(screen.getByTitle('Send as a file'));

    const [updated] = onChange.mock.calls[0];
    expect(updated[0].filePath).toBe('');
    expect(updated[0].value).toBe('');
  });

  it('turns a file row back into a text row', async () => {
    const { onChange, user } = setup([fileRow()]);

    await user.click(screen.getByTitle('Send as a text field'));

    expect(onChange.mock.calls[0][0][0].filePath).toBeUndefined();
  });
});

describe('file rows', () => {
  it('shows only the file name, with the full path as a title', () => {
    setup([fileRow('C:\\Users\\me\\report.pdf')]);

    expect(screen.getByText('report.pdf')).toBeDefined();
    expect(screen.getByTitle('C:\\Users\\me\\report.pdf')).toBeDefined();
  });

  it('prompts to choose a file when none is set', () => {
    setup([{ ...createFormDataEntry('upload'), id: 'row-1', filePath: '' }]);

    expect(screen.getByText('Choose file…')).toBeDefined();
  });

  it('opens the picker and stores the chosen path', async () => {
    const { onChange, onPickFile, user } = setup(
      [{ ...createFormDataEntry('upload'), id: 'row-1', filePath: '' }],
      'C:\\tmp\\picked.bin'
    );

    await user.click(screen.getByText('Choose file…'));

    expect(onPickFile).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0][0].filePath).toBe('C:\\tmp\\picked.bin');
  });

  it('leaves the row alone when the picker is dismissed', async () => {
    const { onChange, user } = setup(
      [{ ...createFormDataEntry('upload'), id: 'row-1', filePath: '' }],
      null
    );

    await user.click(screen.getByText('Choose file…'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('has no value input, since the file is the value', () => {
    setup([fileRow()]);

    expect(screen.queryByPlaceholderText('Value')).toBeNull();
  });
});

const stylesheets = import.meta.glob<string>('/src/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Every class name that some stylesheet under src/ has a rule for. */
function styledClassNames(): Set<string> {
  const names = new Set<string>();

  for (const source of Object.values(stylesheets)) {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/\.([A-Za-z_][\w-]*)/g)) names.add(match[1]);
  }

  return names;
}

describe('styling', () => {
  it('only uses class names that a stylesheet defines', () => {
    const { container } = render(
      <FormDataEditor
        items={[textRow(), { ...fileRow(), id: 'row-2' }]}
        onChange={vi.fn()}
        onPickFile={vi.fn()}
      />
    );
    const styled = styledClassNames();
    // Positive control: a probe that finds nothing would pass every class as unstyled.
    expect(styled.has('kv-editor__row')).toBe(true);

    const used = new Set(
      [...container.querySelectorAll('[class]')].flatMap((el) => [...el.classList])
    );
    const unstyled = [...used].filter((name) => !styled.has(name));

    expect(unstyled).toEqual([]);
  });
});

describe('empty state', () => {
  it('still offers a way to add the first row', async () => {
    const { onChange, user } = setup([]);

    await user.click(screen.getByText('+ Add field'));

    expect(onChange.mock.calls[0][0]).toHaveLength(1);
  });
});
