import {Renderer2} from '@angular/core';
import {DOC_ORIENTATION} from './DOC_ORIENTATION';

type DataUrl = string;

interface UploadResponse {
  image: DataUrl;
  orientation: DOC_ORIENTATION;
  mimetype: string;
}

export class ImageCompress {


  /**
   * Get the correct Orientation value from tags, in order to write correctly in our canvas
   */
  static getOrientation(file: File, callback: (result: DOC_ORIENTATION) => void) {
    const reader = new FileReader();
    try {
      reader.onload = function () {
        const view = new DataView(reader.result as ArrayBuffer);
        if (view.getUint16(0, false) !== 0xFFD8) {
          return callback(DOC_ORIENTATION.NotDefined);
        }
        const length = view.byteLength;
        let offset = 2;
        while (offset < length) {
          const marker = view.getUint16(offset, false);
          offset += 2;
          if (marker === 0xFFE1) {
            if (view.getUint32(offset += 2, false) !== 0x45786966) {
              return callback(DOC_ORIENTATION.NotJpeg);
            }
            const little = view.getUint16(offset += 6, false) === 0x4949;
            offset += view.getUint32(offset + 4, little);
            const tags = view.getUint16(offset, little);
            offset += 2;
            for (let i = 0; i < tags; i++) {
              if (view.getUint16(offset + (i * 12), little) === 0x0112) {
                return callback(view.getUint16(offset + (i * 12) + 8, little));
              }
            }
          } else if ((marker & 0xFF00) !== 0xFF00) {
            break;
          } else {
            offset += view.getUint16(offset, false);
          }
        }
        return callback(DOC_ORIENTATION.NotJpeg);
      };
      reader.readAsArrayBuffer(file);
    } catch (e) {
      return callback(DOC_ORIENTATION.Default);
    }

  }


  /**
   * return a promise with the new image data and image orientation
   */
  static uploadFile(render: Renderer2): Promise<UploadResponse> {

    const promise: Promise<UploadResponse> = new Promise(function (resolve, reject) {

      const inputElement = render.createElement('input');
      // should be fix the problem for safari/ios
      document.getElementsByTagName('body')?.[0]?.append(inputElement);
      render.setStyle(inputElement, 'display', 'none');
      render.setProperty(inputElement, 'type', 'file');
      render.setProperty(inputElement, 'accept', 'image/*');

      render.listen(inputElement, 'click', ($event) => {
        // console.log('MouseEvent:', $event);
        // console.log('Input:', $event.target);
        $event.target.value = null;
      });


      render.listen(inputElement, 'change', ($event) => {
        const file: File = $event.target.files[0];

        const myReader: FileReader = new FileReader();

        myReader.onloadend = () => {
          try {
            ImageCompress.getOrientation(file, orientation => {
              resolve({image: myReader.result as string, orientation, mimetype: file.type});
            });
          } catch (e) {
            // console.log(`ngx-image-compress error ${e}`);
            reject(e);
          }
        };

        try {
          myReader.readAsDataURL(file);
        } catch (e) {
          console.warn(`ngx-image-compress - probably no file have been selected: ${e}`);
          reject('No file selected');
        }

      });
      inputElement.click();

    });

    return promise;
  }


  static compress(imageDataUrlSource: DataUrl,
                  orientation: DOC_ORIENTATION,
                  render: Renderer2,
                  ratio: number = 50,
                  quality: number = 50,
                  maxwidth: number = 0,
                  maxheight: number = 0): Promise<DataUrl> {

    const promise: Promise<DataUrl> = new Promise(function (resolve, reject) {

      quality = quality / 100;
      ratio = ratio / 100;
      const sourceImage = new Image();

      // important for safari: we need to wait for onload event
      sourceImage.onload = function () {
        const canvas: HTMLCanvasElement = render.createElement('canvas');
        const ctx: CanvasRenderingContext2D = canvas.getContext('2d');

        let w = sourceImage.naturalWidth;
        let h = sourceImage.naturalHeight;

        if (orientation === DOC_ORIENTATION.Right || orientation === DOC_ORIENTATION.Left) {
          const t = w;
          w = h;
          h = t;
        }

        let xratio = maxwidth ? maxwidth / w : 1;
        let yratio = maxheight ? maxheight / h : 1;
        ratio = Math.min(ratio, xratio, yratio);
        canvas.width = w * ratio;
        canvas.height = h * ratio;


        const TO_RADIANS = Math.PI / 180;

        if (orientation === DOC_ORIENTATION.Up) {

          ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);

        } else if (orientation === DOC_ORIENTATION.Right) {

          ctx.save();
          ctx.rotate(90 * TO_RADIANS);
          ctx.translate(0, -canvas.width);
          ctx.drawImage(sourceImage, 0, 0, canvas.height, canvas.width);
          ctx.restore();

        } else if (orientation === DOC_ORIENTATION.Left) {

          ctx.save();
          ctx.rotate(-90 * TO_RADIANS);
          ctx.translate(-canvas.width, 0);
          ctx.drawImage(sourceImage, 0, 0, canvas.height, canvas.width);
          ctx.restore();

        } else if (orientation === DOC_ORIENTATION.Down) {

          ctx.save();
          ctx.rotate(180 * TO_RADIANS);
          ctx.translate(-canvas.width, -canvas.height);
          ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
          ctx.restore();

        } else {
          // console.warn('ngx-image-compress - no orientation value found');
          // same as default UP
          ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
        }


        const mime = imageDataUrlSource.substr(5, imageDataUrlSource.split(';')[0].length - 5);
        // TODO test on mime
        const result = canvas.toDataURL(mime, quality);

        resolve(result);

      };

      sourceImage.onerror = function (e) {
        reject(e);
      };

      sourceImage.src = imageDataUrlSource;

    });

    return promise;
  }


  /**
   * helper to evaluate the compression rate
   * @param s the image in base64 string format
   */
  static byteCount(s: DataUrl): number {
    return encodeURI(s).split(/%..|./).length - 1;
  }

}
