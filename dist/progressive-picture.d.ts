type ForceLoadOptions = {
    sizes?: string;
};
declare function observe(): () => void;
declare function forceLoad(element: HTMLImageElement | HTMLPictureElement, options?: ForceLoadOptions): Promise<void>;
export { observe, forceLoad };
