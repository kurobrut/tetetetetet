const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const { createCanvas } = require("@napi-rs/canvas");

const app = express();

app.use(express.json({
	limit: "5mb"
}));

const PORT =
	process.env.PORT || 3000;

const DISCORD_WEBHOOK_URL =
	process.env.DISCORD_WEBHOOK_URL || "";

/* =========================================================
   BASIC DRAWING
========================================================= */

function roundRect(
	ctx,
	x,
	y,
	width,
	height,
	radius
) {
	const r =
		Math.min(
			radius,
			width / 2,
			height / 2
		);

	ctx.beginPath();

	ctx.moveTo(
		x + r,
		y
	);

	ctx.lineTo(
		x + width - r,
		y
	);

	ctx.quadraticCurveTo(
		x + width,
		y,
		x + width,
		y + r
	);

	ctx.lineTo(
		x + width,
		y + height - r
	);

	ctx.quadraticCurveTo(
		x + width,
		y + height,
		x + width - r,
		y + height
	);

	ctx.lineTo(
		x + r,
		y + height
	);

	ctx.quadraticCurveTo(
		x,
		y + height,
		x,
		y + height - r
	);

	ctx.lineTo(
		x,
		y + r
	);

	ctx.quadraticCurveTo(
		x,
		y,
		x + r,
		y
	);

	ctx.closePath();
}

function fillRoundRect(
	ctx,
	x,
	y,
	width,
	height,
	radius,
	color
) {
	ctx.save();

	ctx.fillStyle =
		color;

	roundRect(
		ctx,
		x,
		y,
		width,
		height,
		radius
	);

	ctx.fill();

	ctx.restore();
}

function strokeRoundRect(
	ctx,
	x,
	y,
	width,
	height,
	radius,
	color,
	lineWidth = 1
) {
	ctx.save();

	ctx.strokeStyle =
		color;

	ctx.lineWidth =
		lineWidth;

	roundRect(
		ctx,
		x,
		y,
		width,
		height,
		radius
	);

	ctx.stroke();

	ctx.restore();
}

/* =========================================================
   TEXT
========================================================= */

function humanizeKind(kind) {
	return String(kind || "")
		.replace(/_/g, " ")
		.replace(/\b20\d{2}\b/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(
			/\b\w/g,
			letter =>
				letter.toUpperCase()
		);
}

function wrapText(
	ctx,
	text,
	maxWidth,
	maxLines = 2
) {
	const words =
		String(text || "")
			.split(/\s+/);

	const lines = [];

	let current = "";

	for (const word of words) {
		const test =
			current
				? `${current} ${word}`
				: word;

		if (
			ctx.measureText(test)
				.width <= maxWidth
		) {
			current = test;
		} else {
			if (current) {
				lines.push(current);
			}

			current = word;

			if (
				lines.length
				>= maxLines - 1
			) {
				break;
			}
		}
	}

	if (
		current &&
		lines.length < maxLines
	) {
		lines.push(current);
	}

	return lines;
}

/* =========================================================
   DATE
========================================================= */

function formatTradeDate(
	timestamp
) {
	const value =
		Number(timestamp);

	const date =
		new Date(
			Number.isFinite(value)
				? value * 1000
				: Date.now()
		);

	const dateText =
		date.toLocaleDateString(
			"en-US",
			{
				month: "short",
				day: "numeric",
				year: "numeric"
			}
		);

	const timeText =
		date.toLocaleTimeString(
			"en-US",
			{
				hour: "numeric",
				minute: "2-digit"
			}
		);

	return {
		dateText,
		timeText
	};
}

/* =========================================================
   ITEMS
========================================================= */

function normalizeBoolean(value) {
	return value === true ||
		value === "true";
}

function getItemVisual(item) {
	const category =
		String(
			item?.category || ""
		).toLowerCase();

	const kind =
		String(
			item?.kind || ""
		);

	const properties =
		item?.properties || {};

	if (category === "houses") {
		return {
			icon: "🏠",
			title: "HOUSE",
			name:
				humanizeKind(kind),

			extra:
				properties
					.furniture_quantity
					? `Furni: ${
						Number(
							properties
								.furniture_quantity
						).toLocaleString()
					}`
					: ""
		};
	}

	if (category === "pets") {
		const tags = [];

		if (
			normalizeBoolean(
				properties.mega_neon
			)
		) {
			tags.push("Mega");
		} else if (
			normalizeBoolean(
				properties.neon
			)
		) {
			tags.push("Neon");
		}

		if (
			normalizeBoolean(
				properties.flyable
			)
		) {
			tags.push("Fly");
		}

		if (
			normalizeBoolean(
				properties.rideable
			)
		) {
			tags.push("Ride");
		}

		return {
			icon: "🐾",
			title:
				tags.length > 0
					? tags.join(" ")
					: "PET",

			name:
				humanizeKind(kind),

			extra: ""
		};
	}

	if (
		category === "vehicles"
	) {
		return {
			icon: "🚗",
			title: "VEHICLE",
			name:
				humanizeKind(kind),
			extra: ""
		};
	}

	if (
		category === "toys"
	) {
		return {
			icon: "🧸",
			title: "TOY",
			name:
				humanizeKind(kind),
			extra: ""
		};
	}

	if (
		category === "gifts"
	) {
		return {
			icon: "🎁",
			title: "GIFT",
			name:
				humanizeKind(kind),
			extra: ""
		};
	}

	return {
		icon: "📦",
		title:
			category
				? category.toUpperCase()
				: "ITEM",

		name:
			humanizeKind(kind),

		extra: ""
	};
}

/* =========================================================
   DRAW ITEM SLOT
========================================================= */

function drawSlot(
	ctx,
	x,
	y,
	size,
	item
) {
	fillRoundRect(
		ctx,
		x,
		y,
		size,
		size,
		10,
		"#bfc1c1"
	);

	if (!item) {
		return;
	}

	fillRoundRect(
		ctx,
		x + 3,
		y + 3,
		size - 6,
		size - 6,
		9,
		"#f8f8f8"
	);

	const visual =
		getItemVisual(item);

	ctx.textAlign =
		"center";

	ctx.fillStyle =
		"#222222";

	ctx.font =
		"22px Arial";

	ctx.fillText(
		visual.icon,
		x + size / 2,
		y + 24
	);

	ctx.font =
		"bold 9px Arial";

	ctx.fillStyle =
		"#333333";

	ctx.fillText(
		visual.title,
		x + size / 2,
		y + 39
	);

	ctx.font =
		"8px Arial";

	ctx.fillStyle =
		"#555555";

	const lines =
		wrapText(
			ctx,
			visual.name,
			size - 8,
			2
		);

	let yy =
		y + 50;

	for (
		const line
		of lines
	) {
		ctx.fillText(
			line,
			x + size / 2,
			yy
		);

		yy += 9;
	}

	if (visual.extra) {
		ctx.font =
			"7px Arial";

		ctx.fillStyle =
			"#777777";

		ctx.fillText(
			visual.extra,
			x + size / 2,
			y + size - 5
		);
	}
}

/* =========================================================
   CREATE RECEIPT IMAGE
========================================================= */

function makeTradeReceiptPNG(
	data
) {
	const width =
		900;

	const height =
		220;

	const canvas =
		createCanvas(
			width,
			height
		);

	const ctx =
		canvas.getContext("2d");

	/* -------------------------
	   background
	------------------------- */

	ctx.fillStyle =
		"#d3d4d4";

	ctx.fillRect(
		0,
		0,
		width,
		height
	);

	/* -------------------------
	   main card
	------------------------- */

	fillRoundRect(
		ctx,
		10,
		10,
		width - 20,
		height - 20,
		18,
		"#d8d9d9"
	);

	/* -------------------------
	   left info card
	------------------------- */

	fillRoundRect(
		ctx,
		18,
		18,
		420,
		184,
		15,
		"#f7f7f7"
	);

	/* -------------------------
	   username
	------------------------- */

	const playerName =
		data.other_player_name ||
		data.target_player ||
		"Unknown Player";

	ctx.textAlign =
		"left";

	ctx.fillStyle =
		"#292929";

	ctx.font =
		"bold 24px Arial";

	ctx.fillText(
		playerName,
		34,
		55
	);

	/* -------------------------
	   date and time
	------------------------- */

	const {
		dateText,
		timeText
	} =
		formatTradeDate(
			data.timestamp
		);

	ctx.font =
		"17px Arial";

	ctx.fillStyle =
		"#555555";

	ctx.fillText(
		dateText,
		34,
		86
	);

	ctx.textAlign =
		"right";

	ctx.fillText(
		timeText,
		418,
		86
	);

	/* -------------------------
	   buttons
	------------------------- */

	fillRoundRect(
		ctx,
		32,
		108,
		175,
		57,
		12,
		"#55cf49"
	);

	fillRoundRect(
		ctx,
		220,
		108,
		175,
		57,
		12,
		"#ff9f1f"
	);

	ctx.font =
		"bold 26px Arial";

	ctx.textAlign =
		"center";

	ctx.fillStyle =
		"#ffffff";

	ctx.fillText(
		"View",
		119,
		145
	);

	ctx.fillText(
		"Report",
		307,
		145
	);

	/* -------------------------
	   item grid
	------------------------- */

	const items =
		Array.isArray(
			data.preview_items
		)
			? data.preview_items
			: [];

	const startX =
		470;

	const startY =
		31;

	const slotSize =
		52;

	const gap =
		7;

	const maxSlots =
		9;

	for (
		let i = 0;
		i < maxSlots;
		i++
	) {
		const column =
			i % 3;

		const row =
			Math.floor(
				i / 3
			);

		const x =
			startX +
			column *
				(
					slotSize +
					gap
				);

		const y =
			startY +
			row *
				(
					slotSize +
					gap
				);

		drawSlot(
			ctx,
			x,
			y,
			slotSize,
			items[i]
		);
	}

	/* -------------------------
	   trade refresh icon
	------------------------- */

	ctx.textAlign =
		"center";

	ctx.fillStyle =
		"#313131";

	ctx.font =
		"bold 42px Arial";

	ctx.fillText(
		"↻",
		690,
		113
	);

	/* -------------------------
	   footer info
	------------------------- */

	const previewText =
		data.preview_side === "given"
			? "Items you gave"
			: data.preview_side ===
			  "received"
			? "Items you received"
			: "Trade";

	ctx.textAlign =
		"left";

	ctx.font =
		"12px Arial";

	ctx.fillStyle =
		"#777777";

	ctx.fillText(
		previewText,
		34,
		189
	);

	return canvas.toBuffer(
		"image/png"
	);
}

/* =========================================================
   DISCORD
========================================================= */

async function sendToDiscordWebhook(
	webhookUrl,
	imageBuffer,
	data
) {
	const form =
		new FormData();

	const payload = {
		username:
			"Trade Receipt",

		content:
			`Trade receipt with **${
				data.other_player_name ||
				"Unknown Player"
			}**`
	};

	form.append(
		"payload_json",
		JSON.stringify(
			payload
		)
	);

	form.append(
		"file",
		imageBuffer,
		{
			filename:
				"trade_receipt.png",

			contentType:
				"image/png"
		}
	);

	await axios.post(
		webhookUrl,
		form,
		{
			headers:
				form.getHeaders(),

			maxBodyLength:
				Infinity
		}
	);
}

/* =========================================================
   ROUTES
========================================================= */

/* -------------------------
   HOME
------------------------- */

app.get(
	"/",
	(req, res) => {

		res.send(`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Trade Receipt Server</title>
				<style>
					body {
						background: #151515;
						color: white;
						font-family: Arial, sans-serif;
						padding: 40px;
					}

					.ok {
						color: #58d65c;
					}
				</style>
			</head>

			<body>

				<h1>
					Trade Receipt Server
				</h1>

				<p class="ok">
					Online
				</p>

				<p>
					POST requests:
				</p>

				<code>
					/trade-receipt
				</code>

			</body>
			</html>
		`);
	}
);

/* -------------------------
   BROWSER TEST
------------------------- */

app.get(
	"/trade-receipt",
	(req, res) => {

		res.send(`
			<!DOCTYPE html>
			<html>

			<head>
				<title>
					Trade Receipt
				</title>

				<style>
					body {
						background: #181818;
						color: white;
						font-family: Arial, sans-serif;
						padding: 40px;
					}

					.green {
						color: #56d35b;
					}
				</style>
			</head>

			<body>

				<h1>
					Trade Receipt Endpoint
				</h1>

				<p class="green">
					Endpoint online.
				</p>

				<p>
					Send a POST request to:
				</p>

				<code>
					/trade-receipt
				</code>

			</body>

			</html>
		`);
	}
);

/* -------------------------
   GENERATE + SEND RECEIPT
------------------------- */

app.post(
	"/trade-receipt",
	async (
		req,
		res
	) => {

		try {

			const body =
				req.body || {};

			console.log(
				"Trade receipt request:",
				body.other_player_name,
				body.trade_id
			);

			if (
				!body.other_player_name
			) {
				return res
					.status(400)
					.json({
						ok: false,
						error:
							"Missing other_player_name"
					});
			}

			const imageBuffer =
				makeTradeReceiptPNG(
					body
				);

			/* -------------------------
			   WEBHOOK
			------------------------- */

			const webhookUrl =
				body.webhook_url ||
				DISCORD_WEBHOOK_URL;

			if (webhookUrl) {

				await sendToDiscordWebhook(
					webhookUrl,
					imageBuffer,
					body
				);

				return res.json({
					ok: true,

					message:
						"Trade receipt generated and sent to Discord.",

					player:
						body.other_player_name,

					trade_id:
						body.trade_id
				});

			}

			/* -------------------------
			   NO WEBHOOK
			   RETURN PNG DIRECTLY
			------------------------- */

			res.setHeader(
				"Content-Type",
				"image/png"
			);

			res.setHeader(
				"Content-Disposition",
				'inline; filename="trade_receipt.png"'
			);

			return res.send(
				imageBuffer
			);

		} catch (error) {

			console.error(
				"Trade receipt error:",
				error
			);

			return res
				.status(500)
				.json({
					ok: false,

					error:
						error?.message ||
						String(error)
				});

		}
	}
);

/* =========================================================
   404
========================================================= */

app.use(
	(req, res) => {

		res
			.status(404)
			.json({
				ok: false,

				error:
					"Route not found",

				method:
					req.method,

				path:
					req.path
			});
	}
);

/* =========================================================
   START
========================================================= */

app.listen(
	PORT,
	() => {

		console.log(
			`Trade Receipt Server running on port ${PORT}`
		);

	}
);
