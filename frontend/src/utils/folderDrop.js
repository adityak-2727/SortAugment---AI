/**
 * Extracts image files from drag-and-drop DataTransfer objects (supporting recursive
 * folder drops where subfolder names become class labels) as well as file/folder <input>s.
 *
 * // VERIFY: `DataTransferItem.webkitGetAsEntry()` is supported across Chromium, Firefox,
 * // and Safari for folder drag-and-drop, though behavior on mobile browsers varies.
 */

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|bmp|gif)$/i;

function isImageFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.test(file.name || '');
}

function readAllDirectoryEntries(dirReader) {
  return new Promise((resolve, reject) => {
    const collected = [];
    const readBatch = () => {
      dirReader.readEntries(
        (batch) => {
          if (!batch.length) {
            resolve(collected);
          } else {
            collected.push(...batch);
            readBatch();
          }
        },
        (err) => reject(err)
      );
    };
    readBatch();
  });
}

function getFileFromEntry(fileEntry) {
  return new Promise((resolve, reject) => {
    fileEntry.file(resolve, reject);
  });
}

async function traverseEntry(entry, parentFolder = null, out = []) {
  if (!entry) return out;
  if (entry.isFile) {
    try {
      const file = await getFileFromEntry(entry);
      if (isImageFile(file)) {
        out.push({ file, folderLabel: parentFolder });
      }
    } catch {
      // Skip unreadable files
    }
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const children = await readAllDirectoryEntries(reader);
    for (const child of children) {
      await traverseEntry(child, entry.name, out);
    }
  }
  return out;
}

function normalizeLabelFromFolder(folderName, knownClasses = []) {
  if (!folderName) return 'unlabeled';
  const cleaned = folderName.trim().toLowerCase();
  if (!cleaned) return 'unlabeled';
  const exactMatch = knownClasses.find((c) => c.toLowerCase() === cleaned);
  return exactMatch || cleaned;
}

function buildUniqueFile(file, folderLabel, existingNames) {
  if (!existingNames.has(file.name)) {
    existingNames.add(file.name);
    return file;
  }
  const prefix = folderLabel ? `${folderLabel}_` : '';
  const dotIdx = file.name.lastIndexOf('.');
  const base = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
  const ext = dotIdx > 0 ? file.name.slice(dotIdx) : '';
  let counter = 1;
  let candidate = `${prefix}${base}_${counter}${ext}`;
  while (existingNames.has(candidate)) {
    counter += 1;
    candidate = `${prefix}${base}_${counter}${ext}`;
  }
  existingNames.add(candidate);
  return new File([file], candidate, { type: file.type, lastModified: file.lastModified });
}

/**
 * Parses a Drop event's DataTransfer into [{ file, label }].
 */
export async function extractDroppedImages(dataTransfer, knownClasses = [], existingNames = new Set()) {
  const raw = [];
  const items = dataTransfer?.items ? Array.from(dataTransfer.items) : [];

  const hasEntryApi = items.length > 0 && typeof items[0].webkitGetAsEntry === 'function';
  if (hasEntryApi) {
    const entries = items
      .map((item) => item.webkitGetAsEntry())
      .filter(Boolean);
    for (const entry of entries) {
      await traverseEntry(entry, null, raw);
    }
  } else {
    const files = dataTransfer?.files ? Array.from(dataTransfer.files) : [];
    files.filter(isImageFile).forEach((file) => {
      raw.push({ file, folderLabel: null });
    });
  }

  return raw.map(({ file, folderLabel }) => {
    const uniqueFile = buildUniqueFile(file, folderLabel, existingNames);
    return {
      file: uniqueFile,
      label: normalizeLabelFromFolder(folderLabel, knownClasses),
      inferredFromFolder: Boolean(folderLabel),
    };
  });
}

/**
 * Parses a FileList from <input type="file"> or <input webkitdirectory>.
 */
export function extractInputImages(fileList, knownClasses = [], existingNames = new Set()) {
  const files = Array.from(fileList || []).filter(isImageFile);
  return files.map((file) => {
    let folderLabel = null;
    if (file.webkitRelativePath) {
      const parts = file.webkitRelativePath.split('/').filter(Boolean);
      if (parts.length >= 2) {
        folderLabel = parts[parts.length - 2];
      }
    }
    const uniqueFile = buildUniqueFile(file, folderLabel, existingNames);
    return {
      file: uniqueFile,
      label: normalizeLabelFromFolder(folderLabel, knownClasses),
      inferredFromFolder: Boolean(folderLabel),
    };
  });
}