import React, {useEffect, useState} from 'react';
import usePersistStore from '@/store/use-persist-store';
import {type ImageData, useOutputStore} from '@/store/output';

const ImageCard: React.FC<{ img: ImageData; onClick: (img: ImageData) => void }> = ({img, onClick}) => {
    return (
        <div className="rounded border border-gray-200 p-2 shadow-sm bg-white" onClick={() => onClick(img)}>
            <div className="text-xs text-gray-600 mb-2 truncate" title={img.description}>
                {img.description}
            </div>
            <div>
                <img
                    src={img.image_url}
                    alt={img.description}
                    className="w-full h-auto rounded cursor-zoom-in"
                    loading="lazy"
                />
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-500">
                <span className="px-2 py-0.5 rounded bg-gray-100">{img.size}</span>
                <span className="px-2 py-0.5 rounded bg-gray-100">{img.quality}</span>
            </div>
        </div>
    );
};

const ImageGallery: React.FC = () => {
    const output = usePersistStore(useOutputStore, (s) => s);
    const images = output?.getAllImages() ?? [];
    const [current, setCurrent] = useState<number | null>(null);

    useEffect(() => {
        console.log('[ImageGallery] render images', {count: images.length, images});
    }, [images]);


    const onCopy = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
        } catch {
        }
    };

    const onDownload = (url: string) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'image.png';
        a.click();
    };

    const close = () => setCurrent(null);
    const next = () => setCurrent((idx) => (idx === null ? 0 : (idx + 1) % images.length));
    const prev = () => setCurrent((idx) => (idx === null ? 0 : (idx - 1 + images.length) % images.length));

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (current === null) return;
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowRight') next();
            if (e.key === 'ArrowLeft') prev();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [current, images.length]);

    return (
        <div className="mt-4">
            <div className="mb-2 text-sm font-medium text-gray-700"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {images.map((img, i) => (
                    <ImageCard key={img.id} img={img} onClick={() => setCurrent(i)}/>
                ))}
            </div>

            {current !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                    <div className="max-w-5xl w-full p-4">
                        <div className="flex justify-between items-center mb-2 text-white text-sm">
                            <div className="truncate">{images[current].description}</div>
                            <div className="flex gap-2">
                                <button className="px-2 py-1 bg-gray-700 rounded"
                                        onClick={() => onCopy(images[current].image_url)}>Copy Link
                                </button>
                                <button className="px-2 py-1 bg-gray-700 rounded"
                                        onClick={() => onDownload(images[current].image_url)}>Download
                                </button>
                                <button className="px-2 py-1 bg-gray-700 rounded" onClick={close}>Close</button>
                            </div>
                        </div>
                        <div className="bg-white rounded p-2">
                            <img src={images[current].image_url} alt={images[current].description}
                                 className="w-full h-auto rounded"/>
                            <div className="mt-2 text-xs text-gray-600 flex gap-2">
                                <span>{images[current].size}</span>
                                <span>{images[current].quality}</span>
                                {images[current].created_at && <span>{images[current].created_at}</span>}
                            </div>
                        </div>
                        <div className="absolute inset-y-0 left-2 flex items-center">
                            <button className="px-3 py-2 bg-white/80 rounded" onClick={prev}>‹</button>
                        </div>
                        <div className="absolute inset-y-0 right-2 flex items-center">
                            <button className="px-3 py-2 bg-white/80 rounded" onClick={next}>›</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImageGallery;
