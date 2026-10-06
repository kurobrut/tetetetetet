const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const { createCanvas } = require("@napi-rs/canvas");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, color) {
	ctx.save();
	ctx.fillStyle = color;
	roundRect(ctx, x, y, w, h, r);
	ctx.fill();
	ctx.restore();
}

function strokeRoundRect(ctx, x, y, w, h, r, color, lineWidth = 1) {
	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;
	roundRect(ctx, x, y, w, h, r);
	ctx.stroke();
	ctx.restore();
}

function formatTradeDate(timestamp) {
	const ms = Number(timestamp) * 1000;
	const date = new Date(ms);

	const dateText = date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});

	const timeText = date.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
	});

	return { dateText, timeText };
}

function humanizeKind(kind = "") {
	return String(kind)
		.replace(/_/g, " ")
		.replace(/\b\d{4}\b/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (m) => m.toUpperCase());
}

function shortFurnitureCount(n) {
	const num = Number(n);
	if (!isFinite(num)) return null;
	return num.toLocaleString("en-US");
}

function itemVisual(item) {
	const category = String(item.category || "").toLowerCase();
	const kind = String(item.kind || "");
	const props = item.properties || {};

	if (category === "houses") {
		return {
			emoji: "🏠",
			title: "HOUSE",
			subtitle: humanizeKind(kind),
			extra: props.furniture_quantity
				? `Furni: ${shortFurnitureCount(props.furniture_quantity)}`
				: null,
			bg: "#F7F7F7",
		};
	}

	if (category === "pets") {
		const flags = [];
		if (props.mega_neon === true || props.mega_neon === "true") flags.push("Mega");
		else if (props.neon === true || props.neon === "true") flags.push("Neon");
		if (props.flyable === true || props.flyable === "true") flags.push("Fly");
		if (props.rideable === true || props.rideable === "true") flags.push("Ride");

		return {
			emoji: "🐾",
			title: flags.length > 0 ? flags.join(" / ") : "PET",
			subtitle: humanizeKind(kind),
			extra: null,
			bg: "#F7F7F7",
		};
	}

	if (category === "vehicles") {
		return {
			emoji: "🚗",
			title: "VEHICLE",
			subtitle: humanizeKind(kind),
			extra: null,
			bg: "#F7F7F7",
		};
	}

	if (category === "toys") {
		return {
			emoji: "🧸",
			title: "TOY",
			subtitle: humanizeKind(kind),
			extra: null,
			bg: "#F7F7F7",
		};
	}

	if (category === "gifts") {
		return {
			emoji: "🎁",
			title: "GIFT",
			subtitle: humanizeKind(kind),
			extra: null,
			bg: "#F7F7F7",
		};
	}

	return {
		emoji: "📦",
		title: category ? category.toUpperCase() : "ITEM",
		subtitle: humanizeKind(kind),
		extra: null,
		bg: "#F7F7F7",
	};
}

function drawSlot(ctx, x, y, size, item) {
	fillRoundRect(ctx, x, y, size, size, 12, "#F1F1F1");

	if (!item) return;

	const visual = itemVisual(item);

	fillRoundRect(ctx, x + 3, y + 3, size - 6, size - 6, 10, "#FFFFFF");
	strokeRoundRect(ctx, x + 3, y + 3, size - 6, size - 6, 10, "#E4E4E4", 1);

	ctx.textAlign = "center";

	ctx.font = "24px sans-serif";
	ctx.fillStyle = "#2C2C2C";
	ctx.fillText(visual.emoji, x + size / 2, y + 25);

	ctx.font = "bold 10px sans-serif";
	ctx.fillStyle = "#4A4A4A";
	ctx.fillText(visual.title, x + size / 2, y + 40);

	ctx.font = "9px sans-serif";
	ctx.fillStyle = "#666666";

	const subtitle = visual.subtitle || "";
	const subtitleLines = wrapText(ctx, subtitle, size - 8, 2);

	let subtitleY = y + 52;
	for (const line of subtitleLines) {
		ctx.fillText(line, x + size / 2, subtitleY);
		subtitleY += 10;
	}

	if (visual.extra) {
		ctx.font = "8px sans-serif";
		ctx.fillStyle = "#7A7A7A";
		ctx.fillText(visual.extra, x + size / 2, y + size - 7);
	}
}

function wrapText(ctx, text, maxWidth, maxLines = 2) {
	if (!text) return [];
	const words = String(text).split(" ");
	const lines = [];
	let current = "";

	for (const word of words) {
		const test = current ? `${current} ${word}` : word;
		if (ctx.measureText(test).width <= maxWidth) {
			current = test;
		} else {
			if (current) lines.push(current);
			current = word;
			if (lines.length >= maxLines - 1) break;
		}
	}

	if (current && lines.length < maxLines) {
		lines.push(current);
	}

	if (words.length > 0 && lines.length === maxLines) {
		const last = lines[maxLines - 1];
		if (ctx.measureText(last).width > maxWidth) {
			lines[maxLines - 1] = last.slice(0, Math.max(0, last.length - 3)) + "...";
		}
	}

	return lines;
}

function makeTradeReceiptPNG(data) {
	const width = 920;
	const height = 270;

	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext("2d");

	// background
	ctx.fillStyle = "#EFEFEF";
	ctx.fillRect(0, 0, width, height);

	// main card
	fillRoundRect(ctx, 10, 10, width - 20, height - 20, 22, "#DCDCDC");

	// inner left card
	fillRoundRect(ctx, 18, 18, 430, 142, 18, "#FFFFFF");
	strokeRoundRect(ctx, 18, 18, 430, 142, 18, "#E5E5E5", 1);

	const otherPlayer =
		data.other_player_name ||
		data.target_player ||
		data.targetPlayer ||
		"Unknown Player";

	const { dateText, timeText } = formatTradeDate(data.timestamp || Date.now() / 1000);

	ctx.fillStyle = "#202020";
	ctx.textAlign = "left";

	ctx.font = "bold 25px sans-serif";
	ctx.fillText(otherPlayer, 36, 58);

	ctx.font = "16px sans-serif";
	ctx.fillStyle = "#666666";
	ctx.fillText(dateText, 36, 90);

	ctx.textAlign = "right";
	ctx.fillStyle = "#555555";
	ctx.font = "16px sans-serif";
	ctx.fillText(timeText, 428, 90);

	// buttons
	fillRoundRect(ctx, 34, 108, 165, 46, 11, "#57D24B");
	fillRoundRect(ctx, 214, 108, 165, 46, 11, "#F5A028");

	ctx.textAlign = "center";
	ctx.font = "bold 24px sans-serif";
	ctx.fillStyle = "#FFFFFF";
	ctx.fillText("View", 34 + 82.5, 139);
	ctx.fillText("Report", 214 + 82.5, 139);

	// right-side slots
	const previewItems = Array.isArray(data.preview_items) ? data.preview_items : [];
	const slotsX = 466;
	const slotsY = 32;
	const slotSize = 52;
	const gap = 7;

	const maxSlots = 6;
	for (let i = 0; i < maxSlots; i++) {
		const col = i % 3;
		const row = Math.floor(i / 3);
		const x = slotsX + col * (slotSize + gap);
		const y = slotsY + row * (slotSize + gap);
		drawSlot(ctx, x, y, slotSize, previewItems[i]);
	}

	// refresh icon
	ctx.textAlign = "center";
	ctx.font = "bold 42px sans-serif";
	ctx.fillStyle = "#2E2E2E";
	ctx.fillText("↻", 760, 103);

	// small bottom label
	ctx.textAlign = "left";
	ctx.font = "12px sans-serif";
	ctx.fillStyle = "#7A7A7A";

	const previewSide =
		data.preview_side === "given"
			? "Items you gave"
			: data.preview_side === "received"
			? "Items you received"
			: "Trade preview";

	ctx.fillText(previewSide, 20, 242);

	if (data.trade_id) {
		ctx.textAlign = "right";
		ctx.fillText(`Trade ID: ${data.trade_id}`, 900, 242);
	}

	return canvas.toBuffer("image/png");
}

async function sendToDiscordWebhook(webhookUrl, pngBuffer, data) {
	const form = new FormData();

	form.append(
		"payload_json",
		JSON.stringify({
			username: "Adopt Me Trade Receipt",
			content: `Trade receipt for **${data.other_player_name || data.target_player || "Unknown Player"}**`,
		})
	);

	form.append("file", pngBuffer, {
		filename: "trade_receipt.png",
		contentType: "image/png",
	});

	await axios.post(webhookUrl, form, {
		headers: form.getHeaders(),
		maxBodyLength: Infinity,
	});
}

app.get("/", (_req, res) => {
	res.json({
		ok: true,
		message: "Trade receipt webhook server is running.",
	});
});

app.post("/trade-receipt", async (req, res) => {
	try {
		const body = req.body || {};
		const pngBuffer = makeTradeReceiptPNG(body);

		const webhookUrl = body.webhook_url || DISCORD_WEBHOOK_URL;

		if (!webhookUrl) {
			res.setHeader("Content-Type", "image/png");
			return res.send(pngBuffer);
		}

		await sendToDiscordWebhook(webhookUrl, pngBuffer, body);

		return res.json({
			ok: true,
			message: "Trade receipt image generated and sent to webhook.",
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			ok: false,
			error: err.message || String(err),
		});
	}
});

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
