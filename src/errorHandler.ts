import { Observable } from "rxjs"

export function errorHandler(stream: Observable<any>, name?: string) {
	stream.subscribe(
		() => {},
		err => {
			console.error(`An unexpected error occurred${name ? ` in ${name}` : ""}!`)
			console.error(err)
		},
		() => {}
	)
}
