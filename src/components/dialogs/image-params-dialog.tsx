import React, {useEffect, useState} from 'react';
import {Button} from '@/components/ui/button';

export type ImageParams = {
    style: 'Realistic' | 'Artistic' | 'Cartoon' | 'Photography' | 'Digital Art';
    size: '1024x1024' | '1024x1792' | '1792x1024';
    quality: 'standard' | 'hd';
};

type Props = {
    open: boolean;
    onClose: () => void;
    onSubmit: (params: ImageParams) => Promise<void> | void;
    loading?: boolean;
    error?: string | null;
    defaultPrompt?: string;
};

const styles: ImageParams['style'][] = ['Realistic', 'Artistic', 'Cartoon', 'Photography', 'Digital Art'];
const sizes: ImageParams['size'][] = ['1024x1024', '1024x1792', '1792x1024'];
const qualities: ImageParams['quality'][] = ['standard', 'hd'];

const Chip: React.FC<{ label: string; selected: boolean; onClick: () => void }> = ({label, selected, onClick}) => (
    <button
        type="button"
        className={
            'px-2 py-1 rounded-full text-xs mr-2 mb-2 ' +
            (selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
        }
        onClick={onClick}
    >
        {label}
    </button>
);

const ImageParamsDialog: React.FC<Props> = ({
                                                open,
                                                onClose,
                                                onSubmit,
                                                loading = false,
                                                error = null,
                                                defaultPrompt
                                            }) => {
    const [style, setStyle] = useState<ImageParams['style']>('Realistic');
    const [size, setSize] = useState<ImageParams['size']>('1024x1024');
    const [quality, setQuality] = useState<ImageParams['quality']>('standard');

    useEffect(() => {
        if (!open) return;
        // Reset bei Öffnen
        setStyle('Realistic');
        setSize('1024x1024');
        setQuality('standard');
    }, [open]);

    if (!open) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit({style, size, quality});
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg rounded bg-white shadow-lg">
                <div className="border-b px-4 py-3 font-medium">Bilderzeugung – Parameter</div>
                <form onSubmit={handleSubmit} className="p-4">
                    {defaultPrompt && (
                        <div className="mb-4 text-sm text-gray-700">
                            <span className="font-medium">Beschreibung:</span> {defaultPrompt}
                        </div>
                    )}

                    <div className="mb-3">
                        <div className="mb-1 text-xs text-gray-500">Stil</div>
                        <div className="mb-2">
                            {styles.map((s) => (
                                <Chip key={s} label={s} selected={style === s} onClick={() => setStyle(s)}/>
                            ))}
                        </div>
                        <select className="w-full rounded border p-2 text-sm" value={style}
                                onChange={(e) => setStyle(e.target.value as any)}>
                            {styles.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="mb-3">
                        <div className="mb-1 text-xs text-gray-500">Größe</div>
                        <div className="mb-2">
                            {sizes.map((s) => (
                                <Chip key={s} label={s} selected={size === s} onClick={() => setSize(s as any)}/>
                            ))}
                        </div>
                        <select className="w-full rounded border p-2 text-sm" value={size}
                                onChange={(e) => setSize(e.target.value as any)}>
                            {sizes.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="mb-3">
                        <div className="mb-1 text-xs text-gray-500">Qualität</div>
                        <div className="mb-2">
                            {qualities.map((q) => (
                                <Chip key={q} label={q} selected={quality === q} onClick={() => setQuality(q as any)}/>
                            ))}
                        </div>
                        <select className="w-full rounded border p-2 text-sm" value={quality}
                                onChange={(e) => setQuality(e.target.value as any)}>
                            {qualities.map((q) => (
                                <option key={q} value={q}>
                                    {q}
                                </option>
                            ))}
                        </select>
                    </div>

                    {error && <div className="mb-3 text-sm text-red-600">{error}</div>}

                    <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="secondary" disabled={loading} onClick={onClose}>
                            Abbrechen
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Erzeuge…' : 'Erzeugen'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ImageParamsDialog;
