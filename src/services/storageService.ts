import { app } from './cloudbase';
import { COVER_PREFIX, MAX_COVER_BYTES, TEMP_URL_MAX_AGE } from '../constants/theme';

/**
 * 云存储服务
 *
 * 需求 R5：封面图上传（可选、类型与大小校验、进度反馈）
 * 需求 R7.4：删除卡片时联动清理封面文件
 */

/** 上传结果 */
export interface UploadResult {
  fileID: string;
}

/** 校验结果 */
export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * 校验封面图文件
 *
 * 需求 R5.1/R5.4：限定 image/* 且不超过 5 MB，超限时给出具体限制值
 */
export function validateImage(file: File): ValidationResult {
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: '请选择图片文件（支持 JPG、PNG、WebP 等）' };
  }

  if (file.size > MAX_COVER_BYTES) {
    const limitMb = (MAX_COVER_BYTES / 1024 / 1024).toFixed(0);
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    return { ok: false, error: `图片大小 ${sizeMb} MB，超过 ${limitMb} MB 上限` };
  }

  return { ok: true };
}

/**
 * 生成云存储路径
 *
 * 加时间戳前缀避免同名覆盖；清理文件名中的非法字符
 * （云存储合法字符为 [0-9a-zA-Z]/!-_.* 与中文）
 */
function buildCloudPath(originalName: string): string {
  const dotIndex = originalName.lastIndexOf('.');
  const rawExt = dotIndex >= 0 ? originalName.slice(dotIndex + 1) : 'jpg';
  // 只保留字母数字，其他一律丢弃
  const safeExt = rawExt.replace(/[^0-9a-zA-Z]/g, '') || 'jpg';

  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return `${COVER_PREFIX}/${safeName}.${safeExt.toLowerCase()}`;
}

/**
 * 上传封面图
 *
 * 参数类型说明（易踩坑）：
 * skill 文档的参数表注释写的是 "HTML file input element"，
 * 但其官方示例代码传的是 `fileInput.files[0]`，
 * 即 **File 对象**。核对 SDK 运行时实现确认：
 * `FormData.append("file", filePath)` —— FormData 只接受 Blob/File，
 * 传DOM 元素会被字符串化而失败。
 * 因此这里接收 File 对象。
 *
 * @param file 图片文件
 * @param onProgress 上传进度回调 0-100
 */
export function uploadCover(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const validation = validateImage(file);
  if (!validation.ok) {
    return Promise.reject(new Error(validation.error ?? '图片校验失败'));
  }

  const cloudPath = buildCloudPath(file.name);

  // SDK 类型声明中 filePath 为 string，与实际用法不符，
  // 故在此做必要的类型转换
  return app
    .uploadFile({
      cloudPath,
      filePath: file as unknown as string,
      onUploadProgress: (evt: { loaded: number; total: number }) => {
        if (!onProgress || !evt.total) {
          return;
        }
        const percent = Math.round((evt.loaded * 100) / evt.total);
        onProgress(Math.min(percent, 100));
      },
    })
    .then((res: { fileID?: string; code?: string; message?: string }) => {
      if (res.code) {
        throw new Error(res.message || '图片上传失败');
      }
      if (!res.fileID) {
        throw new Error('上传成功但未返回文件标识');
    }
      return { fileID: res.fileID };
    });
}

/** fileID → 可访问的临时链接 */
export type CoverUrlMap = Record<string, string>;

/**
 * 批量获取封面临时链接
 *
 * 需求 R6.9：单项失败不影响整体，失败项不进入映射表，
 * 由调用方回退到配色背景。
 */
export async function getCoverUrls(fileIDs: string[]): Promise<CoverUrlMap> {
  if (fileIDs.length === 0) {
    return {};
  }

  try {
    const res = await app.getTempFileURL({
      fileList: fileIDs.map((fileID) => ({ fileID, maxAge: TEMP_URL_MAX_AGE })),
    });

    const map: CoverUrlMap = {};
    for (const item of res.fileList ?? []) {
      if (item.code === 'SUCCESS' && item.tempFileURL) {
        // fileID 即map 的 key
        map[item.fileID] = item.tempFileURL;
      }
    }
    return map;
  } catch {
    // 临时链接获取整体失败时返回空表，UI 会回退到配色背景
    return {};
  }
}

/**
 * 删除封面文件
 *
 * 需求 R7.6：删除失败不阻塞数据库删除，因此调用方需自行 catch。
 */
export async function deleteCover(fileID: string): Promise<void> {
  const res = await app.deleteFile({ fileList: [fileID] });

  const result = res.fileList?.[0];
  if (!result || result.code !== 'SUCCESS') {
    throw new Error('封面文件删除失败');
  }
}