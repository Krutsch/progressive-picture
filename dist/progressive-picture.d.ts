declare function observe(): () => void;
declare function forceLoad(element: HTMLImageElement | HTMLPictureElement): Promise<void>;
export { observe, forceLoad };
