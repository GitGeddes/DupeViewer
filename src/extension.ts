// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "dupe-viewer" is now active!');

	// create a decorator type that we use to decorate small numbers
	const dupeCodeDecoratorType = vscode.window.createTextEditorDecorationType({
		borderWidth: '1px',
		borderStyle: 'solid',
		overviewRulerColor: 'red',
		overviewRulerLane: vscode.OverviewRulerLane.Right,
		light: {
			// this color will be used in light color themes
			borderColor: 'firebrick'
		},
		dark: {
			// this color will be used in dark color themes
			borderColor: 'firebrick'
		}
	});

	let activeEditor = vscode.window.activeTextEditor;
	let timeout: NodeJS.Timeout | undefined = undefined;
	const decorations: vscode.DecorationOptions[] = [];

	const lineOffset = -1;
	const columnOffset = 7;

	type StatsEntry = {
		lines: number,
		tokens: number,
		sources: number,
		clones: number,
		duplicatedLines: number,
		duplicatedTokens: number,
		percentage: number,
		percentageTokens: number,
		newDuplicatedLines: number,
		newClones: number
	};
	type EntryLocation = {
		line: number,
		column: number,
		position: number
	};
	type FileEntry = {
		name: string,
		start: number,
		end: number,
		startLoc: EntryLocation,
		endLoc: EntryLocation
	};
	type DupeEntry = {
		format: string,
		lines: number,
		fragment: string,
		tokens: number,
		firstFile: FileEntry,
		secondFile: FileEntry
	};
	type DupeJson = {
		statistics: object,
		duplicates: DupeEntry[],
		filename: string
	};

	function updateDecorations(message: string, startPos: vscode.Position, endPos: vscode.Position) {
		const decoration: vscode.DecorationOptions = {
			range: new vscode.Range(startPos, endPos),
			hoverMessage: message
		};
		decorations.push(decoration);
	}

	function finalizeDecorations() {
		if (activeEditor && decorations.length > 0) {
			activeEditor.setDecorations(dupeCodeDecoratorType, decorations);
		} else if (!activeEditor) {
			vscode.window.showInformationMessage('No active editor');
		}
	}

	async function isActiveFileInJson() {
		if (activeEditor) {
			const files = await vscode.workspace.findFiles('**/jscpd-report.json').then((result) => {
				return result;
			});
			const json = require(files[0].fsPath);
			const activeFilename = activeEditor.document.fileName;
			const fileSources = json.statistics.formats.javascript.sources;
			const folders = vscode.workspace.workspaceFolders;
			if (folders) {
				const folderPath = folders[0].uri.fsPath;
				const trimmed = activeFilename.replace(folderPath, '').replaceAll('\\', '/').slice(1);
				const fileInJson: StatsEntry = fileSources[trimmed];
				if (fileInJson !== undefined) {
					vscode.window.showInformationMessage('Highlighted ' + fileInJson.clones + ' dupes');
					return fileInJson.clones > 0;
				} else {
					return false;
				}
			} else {
				return false;
			}
		} else {
			console.log("didn't load json");
			return false;
		}
	}

	function hoverMessageBuilder(filename: string, start: number, end: number) {
		return 'Duplicate code found with file:\n'
			+ filename + '\n'
			+ `Start: ${start},\n`
			+ `End: ${end}.`;
	}

	function updateActiveFileInEntry(entry: DupeEntry) {
		if (!activeEditor) {
			return;
		}
		const folders = vscode.workspace.workspaceFolders;
		if (folders) {
			const activeFilename = activeEditor.document.fileName;
			const firstFileName = entry.firstFile.name.replaceAll('\\\\', "\\");
			const secondFileName = entry.secondFile.name.replaceAll('\\\\', "\\");
			const folderPath = folders[0].uri.fsPath;
			const trimmed = activeFilename.replace(folderPath, '').slice(1);
			if (firstFileName === trimmed) {
				const startPos = new vscode.Position(
					entry.firstFile.startLoc.line + lineOffset,
					entry.firstFile.startLoc.column + columnOffset);
				const endPos = new vscode.Position(
					entry.firstFile.endLoc.line + lineOffset,
					entry.firstFile.endLoc.column + columnOffset);
				updateDecorations(
					hoverMessageBuilder(
						secondFileName,
						entry.secondFile.startLoc.line,
						entry.secondFile.endLoc.line),
					startPos,
					endPos);
			} else if (secondFileName === trimmed) {
				const startPos = new vscode.Position(
					entry.secondFile.startLoc.line + lineOffset,
					entry.secondFile.startLoc.column + columnOffset);
				const endPos = new vscode.Position(
					entry.secondFile.endLoc.line + lineOffset,
					entry.secondFile.endLoc.column + columnOffset);
				updateDecorations(
					hoverMessageBuilder(
						firstFileName,
						entry.firstFile.startLoc.line,
						entry.firstFile.endLoc.line),
					startPos,
					endPos);
			}
		}
	}

	function getDuplicateStats() {
		vscode.workspace.findFiles('**/jscpd-report.json').then((results) => {
			if (results.length > 0) {
				const json: DupeJson = require(results[0].fsPath);
				json.duplicates.forEach((entry: DupeEntry) => {
					updateActiveFileInEntry(entry);
				});
				finalizeDecorations();
			}
		});
	}

	function getDupes() {
		decorations.length = 0;
		isActiveFileInJson().then((hasDupes) => {
			console.log('active file has dupes?', hasDupes, activeEditor?.document.fileName);
			if (hasDupes) {
				getDuplicateStats();
			}
		});
	}

	function triggerUpdateDecorations(throttle = false) {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		if (throttle) {
			timeout = setTimeout(getDupes, 500);
		} else {
			getDupes();
		}
	}

	let detectDupes = vscode.commands.registerCommand('dupe-viewer.detectDupes', getDupes);

	context.subscriptions.push(detectDupes);

	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
			triggerUpdateDecorations(true);
		}
	}, null, context.subscriptions);
}

// This method is called when your extension is deactivated
export function deactivate() {}
