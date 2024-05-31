export const configFields = [
	{
		type: 'static-text',
		id: 'info',
		width: 12,
		label: 'Information',
		value:
			"<strong>PAS SI IMPORTANT À LIRE!</strong> Bah c'est le module pour le routeur xnmos quoi.</b>",
	},
	{
		type: 'textinput',
		id: 'prefix',
		label: 'URL',
		width: 12,
		default: '',
	},
	{
		type: 'static-text',
		id: 'rejectUnauthorizedInfo',
		width: 12,
		value: `
					<hr />
					<h5>ATTENTION</h5>
					Le module rejette les certificats considérés comme invalides pour les raisons suivantes:
					<ul>
						<li>Certificate is expired</li>
						<li>Certificate has the wrong host</li>
						<li>Untrusted root certificate</li>
						<li>Certificate is self-signed</li>
					</ul>
					<p>
						Si on veut se connecter à un hôte avec un certificat auto-signé, il faut <strong>Accepter les certificats non autorisés</strong>.
					</p>
					<p><strong>PRENDRE EN COMPTE LES RISQUES!<strong></p>
				`,
	},
	{
		type: 'dropdown',
		id: 'rejectUnauthorized',
		label: 'Certificats Non Autorisés',
		width: 6,
		default: true,
		choices: [
			{ id: true, label: 'Rejeter' },
			{ id: false, label: 'Accepter - Prendre en compte les risques!' },
		],
	},
]
