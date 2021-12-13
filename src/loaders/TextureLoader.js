import { ImageLoader } from './ImageLoader.js';
import { Texture } from '../textures/Texture.js';
import { Loader } from './Loader.js';

class TextureLoader extends Loader {

	constructor( manager, canvas ) {
		super( manager, canvas );
	}

	load( url, onLoad, onProgress, onError ) {

		const texture = new Texture();

		const loader = new ImageLoader( this.manager, this.canvas );
		loader.setCrossOrigin( this.crossOrigin );
		loader.setPath( this.path );

		loader.load( url, function ( image ) {

			texture.image = image;
			texture.needsUpdate = true;
			console.log('xxxxxx', texture, onLoad)
			if ( onLoad !== undefined ) {
				console.log('1111111', onLoad)
				onLoad( texture );
				console.log('2222')
			}
			console.log('3333')
		}, onProgress, onError );

		return texture;

	}

}


export { TextureLoader };
