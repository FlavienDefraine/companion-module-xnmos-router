import { InstanceBase, runEntrypoint, InstanceStatus } from '@companion-module/base'
import got from 'got'
import { configFields } from './config.js'
import { upgradeScripts } from './upgrade.js'
import { FIELDS } from './fields.js'
import JimpRaw from 'jimp'

// Webpack makes a mess..
const Jimp = JimpRaw.default || JimpRaw

class GenericHttpInstance extends InstanceBase {
	configUpdated(config) {
		this.config = config

		this.executeGetSendersReceivers(config);

		this.initActions()
		this.initFeedbacks()
	}

	async executeGetSendersReceivers(config) {
		const userInputUrl = config.prefix;

		let variableIdsArray = new Array();
		let variablesDefinitions = new Array();
		let resultIdsArray = new Array();

		const modifiedSendersUrl = `http://${userInputUrl}/x-nmos/connection/v1.0/single/senders`;  
		const sendersOptions = {
			
		};
		
	  
		try {
		  	const response = await got.get(modifiedSendersUrl, sendersOptions);
	  
			let resultData = response.body;
			let resultArray = new Array();
	  
			try {
				resultArray = resultData.split(",");
				resultIdsArray.push(resultArray);
			} catch (error) {
				// error stringifying
			}
	  
			for (let i = 0; i < resultArray.length; i++) {
				const variableId = `sender-${i}`;
			  	variablesDefinitions.push({
					variableId: variableId,
					name: `Sender ${i + 1}`,
			  	});
				variableIdsArray.push(variableId);
			}
	  
		  	this.updateStatus(InstanceStatus.Ok);
		} catch (e) {
		  		this.log('error', `HTTP GET Request failed (${e.message})`);
		  		this.updateStatus(InstanceStatus.UnknownError, e.code);
			}

		const modifiedReceiversUrl = `http://${userInputUrl}/x-nmos/connection/v1.0/single/receivers`;  
		const receiversOptions = {
			
		};

		try {
			const response = await got.get(modifiedReceiversUrl, receiversOptions);
	
		  	let resultData = response.body;
		  	let resultArray = new Array();
	
		  	try {
			  	resultArray = resultData.split(",");
				resultIdsArray.push(resultArray);
		  	} catch (error) {
			  	// error stringifying
		  	}
	
		  	for (let i = 0; i < resultArray.length; i++) {
				const variableId = `receiver-${i}`;
				variablesDefinitions.push({
				  variableId: variableId,
				  name: `Receiver ${i + 1}`,
				});
				variableIdsArray.push(variableId);
		  	}
	
			this.updateStatus(InstanceStatus.Ok);
		} catch (e) {
				this.log('error', `HTTP GET Request failed (${e.message})`);
				this.updateStatus(InstanceStatus.UnknownError, e.code);
	  		}

		// Crée la variable personnalisée
		this.setVariableDefinitions(variablesDefinitions);

		for (let i = 0; i < variableIdsArray.length; i++) {
			const variableId = variableIdsArray[i];
			this.setVariableValues({
				[variableId]: resultIdsArray[i]
			});
		}

	}

	init(config) {
		this.config = config

		this.updateStatus(InstanceStatus.Ok)

		this.initActions()
		this.initFeedbacks()
	}

	// Return config fields for web config
	getConfigFields() {
		return configFields
	}

	// When module gets deleted
	async destroy() {
		// Stop any running feedback timers
		for (const timer of Object.values(this.feedbackTimers)) {
			clearInterval(timer)
		}
	}

	async prepareQuery(context, action, includeBody) {
		let url = await context.parseVariablesInString(action.options.url || '')
		if (url.substring(0, 4) !== 'http') {
			if (this.config.prefix && this.config.prefix.length > 0) {
				url = `${this.config.prefix}${url.trim()}`
			}
		}

		let body = {}
		if (includeBody && action.options.body && action.options.body.trim() !== '') {
			body = await context.parseVariablesInString(action.options.body || '')

			if (action.options.contenttype === 'application/json') {
				//only parse the body if we are explicitly sending application/json
				try {
					body = JSON.parse(body)
				} catch (e) {
					this.log('error', `HTTP ${action.actionId.toUpperCase()} Request aborted: Malformed JSON Body (${e.message})`)
					this.updateStatus(InstanceStatus.UnknownError, e.message)
					return
				}
			}
		}

		let headers = {}
		if (action.options.header.trim() !== '') {
			const headersStr = await context.parseVariablesInString(action.options.header || '')

			try {
				headers = JSON.parse(headersStr)
			} catch (e) {
				this.log('error', `HTTP ${action.actionId.toUpperCase()} Request aborted: Malformed JSON Header (${e.message})`)
				this.updateStatus(InstanceStatus.UnknownError, e.message)
				return
			}
		}

		if (includeBody && action.options.contenttype) {
			headers['Content-Type'] = action.options.contenttype
		}

		const options = {
			https: {
				rejectUnauthorized: this.config.rejectUnauthorized,
			},

			headers,
		}

		if (includeBody) {
			if (typeof body === 'string') {
				body = body.replace(/\\n/g, '\n')
				options.body = body
			} else if (body) {
				options.json = body
			}
		}

		return {
			url,
			options,
		}
	}

	initActions() {
		const urlLabel = this.config.prefix ? 'URI' : 'URL'

		this.setActionDefinitions({
			post: {
				name: 'POST',
				options: [FIELDS.Url(urlLabel), FIELDS.Body, FIELDS.Header, FIELDS.ContentType],
				callback: async (action, context) => {
					const { url, options } = await this.prepareQuery(context, action, true)

					try {
						await got.post(url, options)

						this.updateStatus(InstanceStatus.Ok)
					} catch (e) {
						this.log('error', `HTTP POST Request failed (${e.message})`)
						this.updateStatus(InstanceStatus.UnknownError, e.code)
					}
				},
			},
			get: {
				name: 'GET',
				options: [
					FIELDS.Url(urlLabel),
					FIELDS.Header,
					{
						type: 'custom-variable',
						label: 'JSON Response Data Variable',
						id: 'jsonResultDataVariable',
					},
					{
						type: 'checkbox',
						label: 'JSON Stringify Result',
						id: 'result_stringify',
						default: true,
					},
				],
				callback: async (action, context) => {
					const { url, options } = await this.prepareQuery(context, action, false)

					try {
						const response = await got.get(url, options)

						// store json result data into retrieved dedicated custom variable
						const jsonResultDataVariable = action.options.jsonResultDataVariable
						if (jsonResultDataVariable) {
							this.log('debug', `Writing result to ${jsonResultDataVariable}`)

							let resultData = response.body

							if (!action.options.result_stringify) {
								try {
									resultData = JSON.parse(resultData)
								} catch (error) {
									//error stringifying
								}
							}

							this.setCustomVariableValue(jsonResultDataVariable, resultData)
						}

						this.updateStatus(InstanceStatus.Ok)
					} catch (e) {
						this.log('error', `HTTP GET Request failed (${e.message})`)
						this.updateStatus(InstanceStatus.UnknownError, e.code)
					}
				},
			},
			put: {
				name: 'PUT',
				options: [FIELDS.Url(urlLabel), FIELDS.Body, FIELDS.Header, FIELDS.ContentType],
				callback: async (action, context) => {
					const { url, options } = await this.prepareQuery(context, action, true)

					try {
						await got.put(url, options)

						this.updateStatus(InstanceStatus.Ok)
					} catch (e) {
						this.log('error', `HTTP PUT Request failed (${e.message})`)
						this.updateStatus(InstanceStatus.UnknownError, e.code)
					}
				},
			},
			patch: {
				name: 'PATCH',
				options: [FIELDS.Url(urlLabel), FIELDS.Body, FIELDS.Header, FIELDS.ContentType],
				callback: async (action, context) => {
					const { url, options } = await this.prepareQuery(context, action, true)

					try {
						await got.patch(url, options)

						this.updateStatus(InstanceStatus.Ok)
					} catch (e) {
						this.log('error', `HTTP PATCH Request failed (${e.message})`)
						this.updateStatus(InstanceStatus.UnknownError, e.code)
					}
				},
			},
			delete: {
				name: 'DELETE',
				options: [FIELDS.Url(urlLabel), FIELDS.Body, FIELDS.Header],
				callback: async (action, context) => {
					const { url, options } = await this.prepareQuery(context, action, true)

					try {
						await got.delete(url, options)

						this.updateStatus(InstanceStatus.Ok)
					} catch (e) {
						this.log('error', `HTTP DELETE Request failed (${e.message})`)
						this.updateStatus(InstanceStatus.UnknownError, e.code)
					}
				},
			},
			/*getReceivers: {
				name: 'GET Receivers',
				options: [
					FIELDS.UrlNMOS(urlLabel),
					FIELDS.Header,
					{
						type: 'custom-variable',
						label: 'JSON Response Data Variable',
						id: 'jsonResultDataVariable',
					},
					{
						type: 'checkbox',
						label: 'JSON Stringify Result',
						id: 'result_stringify',
						default: true,
					},
				],
				callback: async (action, context) => {
					const { urlnmos, options } = await this.prepareQuery(context, action, false)

					const userInputUrl = action.options.urlnmos;
					const modifiedUrl = `http://${userInputUrl}/x-nmos/connection/v1.0/single/receivers`;

					try {
						const response = await got.get(modifiedUrl, options)

						// store json result data into retrieved dedicated custom variable
						const jsonResultDataVariable = action.options.jsonResultDataVariable
						if (jsonResultDataVariable) {
							this.log('debug', `Writing result to ${jsonResultDataVariable}`)

							let resultData = response.body

							if (!action.options.result_stringify) {
								try {
									resultData = JSON.parse(resultData)
								} catch (error) {
									//error stringifying
								}
							}

							this.setCustomVariableValue(jsonResultDataVariable, resultData)
						}

						this.updateStatus(InstanceStatus.Ok)
					} catch (e) {
						this.log('error', `HTTP GET Request failed (${e.message})`)
						this.updateStatus(InstanceStatus.UnknownError, e.code)
					}
				},
			},*/
			/*getSenders: {
				name: 'GET Senders',
				options: [
					FIELDS.UrlNMOS(urlLabel),
					FIELDS.Header,
					{
						type: 'custom-variable',
						label: 'JSON Response Data Variable',
						id: 'jsonResultDataVariable',
					},
					{
						type: 'checkbox',
						label: 'JSON Stringify Result',
						id: 'result_stringify',
						default: true,
					},
				],
				callback: async (action, context) => {
					const { urlnmos, options } = await this.prepareQuery(context, action, false)

					const userInputUrl = action.options.urlnmos;
					const modifiedUrl = `http://${userInputUrl}/x-nmos/connection/v1.0/single/senders`;

					try {
						const response = await got.get(modifiedUrl, options)

						// store json result data into retrieved dedicated custom variable
						const jsonResultDataVariable = action.options.jsonResultDataVariable
						if (jsonResultDataVariable) {
							this.log('debug', `Writing result to ${jsonResultDataVariable}`)

							let resultData = response.body

							if (!action.options.result_stringify) {
								try {
									resultData = resultData.split(",");
								} catch (error) {
									//error stringifying
								}
							}
							
							this.setCustomVariableValue(jsonResultDataVariable, resultData)

							// Crée les variables personnalisées dynamiquement
							const variablesDefinitions = []; // déclare le tableau avant la boucle

							for (let i = 0; i < resultData.length; i++) {
  								variablesDefinitions.push({ // utilise push pour ajouter un nouvel élément au tableau
    								id: `sender-${i}`,
								    name: `Sender ${i + 1}`,
								    type: 'string',
    								value: resultData[i],
  								});
							}

							// Crée la variable personnalisée
							this.setVariableDefinitions(variablesDefinitions);
						}

						this.updateStatus(InstanceStatus.Ok)
					} catch (e) {
						this.log('error', `HTTP GET Request failed (${e.message})`)
						this.updateStatus(InstanceStatus.UnknownError, e.code)
					}
				},
			},*/
			patchTake: {
				name: 'PATCH Take',
				options: [
				  FIELDS.UrlNMOS(urlLabel),
				  FIELDS.Body, // We will use this to send the JSON payload
				  FIELDS.Header,
				  FIELDS.ContentType
				],
				callback: async (action, context) => {
					const { urlnmos, options } = await this.prepareQuery(context, action, true)

					const userInputUrl = action.options.urlnmos;

					const modifiedReceiversUrl = `http://${userInputUrl}/x-nmos/connection/v1.0/single/receivers`;
					const receiverId = '';
					const receiverIdUrl = `${modifiedReceiversUrl}/${receiverId}/staged`;
			  
					const modifiedSendersUrl = `http://${userInputUrl}/x-nmos/connection/v1.0/single/senders`;
					const senderId = '';
					const senderIdUrl = `${modifiedSendersUrl}/${senderId}`;
					const sdpUrl = `${senderIdUrl}/transportfile`;

					try {
						const sdpFile = await fetch(sdpUrl);
						const sdpString = await sdpFile.text();

						const jsonPayload = JSON.stringify({
							sender_id: senderId,
							master_enable: true,
							activation: {
								mode: 'activate_immediate',
								requested_time: null
							},
							tranport_file: {
								data: sdpString,
								type: "application/sdp",
							}
						});
			  
						action.options.body = jsonPayload;
						action.options.header = {
							'Content-Type': 'application/json',
							...action.options.header,
						};

						await got.patch(receiverIdUrl, options)
			  
						this.updateStatus(InstanceStatus.Ok)
					} catch (e) {
						this.log('error', `Error downloading file: ${e}`)
						this.log('error', `HTTP PATCH Request failed (${e.message})`)
						this.updateStatus(InstanceStatus.UnknownError, e.code)
					}
				},
			},
		})
	}

	feedbackTimers = {}

	initFeedbacks() {
		const urlLabel = this.config.prefix ? 'URI' : 'URL'

		this.setFeedbackDefinitions({
			imageFromUrl: {
				type: 'advanced',
				name: 'Image from URL',
				options: [FIELDS.Url(urlLabel), FIELDS.Header, FIELDS.PollInterval],
				subscribe: (feedback) => {
					// Ensure existing timer is cleared
					if (this.feedbackTimers[feedback.id]) {
						clearInterval(this.feedbackTimers[feedback.id])
						delete this.feedbackTimers[feedback.id]
					}

					// Start new timer if needed
					if (feedback.options.interval) {
						this.feedbackTimers[feedback.id] = setInterval(() => {
							this.checkFeedbacksById(feedback.id)
						}, feedback.options.interval)
					}
				},
				unsubscribe: (feedback) => {
					// Ensure timer is cleared
					if (this.feedbackTimers[feedback.id]) {
						clearInterval(this.feedbackTimers[feedback.id])
						delete this.feedbackTimers[feedback.id]
					}
				},
				callback: async (feedback, context) => {
					try {
						const { url, options } = await this.prepareQuery(context, feedback, false)

						const res = await got.get(url, options)

						// Scale image to a sensible size
						const img = await Jimp.read(res.rawBody)
						const png64 = await img
							.scaleToFit(feedback.image?.width ?? 72, feedback.image?.height ?? 72)
							.getBase64Async('image/png')

						return {
							png64,
						}
					} catch (e) {
						// Image failed to load so log it and output nothing
						this.log('error', `Failed to fetch image: ${e}`)
						return {}
					}
				},
			},
		})
	}
}

runEntrypoint(GenericHttpInstance, upgradeScripts)
