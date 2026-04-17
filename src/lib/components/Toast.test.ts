import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Toast from './Toast.svelte';

describe('Toast component', () => {
    it('renders the message and applies the success class', () => {
        const handleClose = vi.fn();

        render(Toast, {
            props: {
                message: 'Hello world',
                type: 'success',
                duration: 3000,
                onClose: handleClose
            }
        });

        expect(screen.getByText('Hello world')).toBeDefined();
        expect(screen.getByText('check_circle')).toBeDefined();

        const toast = screen.getByText('Hello world').closest('.toast');
        expect(toast).not.toBeNull();
        expect(toast?.classList.contains('success')).toBe(true);
    });

    it('calls onClose when clicked', async () => {
        const handleClose = vi.fn();

        render(Toast, {
            props: {
                message: 'Click me',
                type: 'error',
                duration: 3000,
                onClose: handleClose
            }
        });

        await fireEvent.click(screen.getByText('Click me'));
        expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose after duration elapses', async () => {
        const handleClose = vi.fn();

        render(Toast, {
            props: {
                message: 'Timeout',
                type: 'success',
                duration: 10,
                onClose: handleClose
            }
        });

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(handleClose).toHaveBeenCalledTimes(1);
    });
});
