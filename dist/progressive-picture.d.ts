declare const progessiveLoaded: WeakSet<HTMLPictureElement>;
declare const observer: IntersectionObserver;
declare const pictures: NodeIterator;
declare let current: any;
declare const DOMObserver: void;
declare function preload(imgOrSrcs: Array<HTMLImageElement> | NodeListOf<HTMLSourceElement>, src: string, img: HTMLImageElement): Promise<true | undefined>;
declare function iteratePictures(node: Node): NodeIterator;
