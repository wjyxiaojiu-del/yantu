import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, Image, Code, BookOpen, Folder, Upload, Download, Trash2, PenLine,
  Search, Filter, X, File, FileSpreadsheet, FileCode, FileImage, FileArchive,
  Eye, Grid, List, ChevronDown, Tag, User
} from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';

const categories = [
  { key: 'all', label: '全部', icon: Folder },
  { key: 'document', label: '文档', icon: FileText },
  { key: 'paper', label: '论文', icon: BookOpen },
  { key: 'code', label: '代码', icon: Code },
  { key: 'image', label: '图片', icon: Image },
  { key: 'other', label: '其他', icon: File },
];

function getFileIcon(mime) {
  if (mime?.startsWith('image/')) return FileImage;
  if (mime?.includes('pdf')) return FileText;
  if (mime?.includes('zip') || mime?.includes('rar') || mime?.includes('7z')) return FileArchive;
  if (mime?.includes('sheet') || mime?.includes('excel') || mime?.includes('csv')) return FileSpreadsheet;
  if (mime?.includes('javascript') || mime?.includes('json') || mime?.includes('html') || mime?.includes('css') || mime?.includes('text')) return FileCode;
  return FileText;
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

export default function FileLibrary() {
  const { user } = useAuth();
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      const params = activeCategory === 'all' ? {} : { category: activeCategory };
      const data = await api.getFiles(params);
      setFiles(data);
    } catch (e) {
      toast?.show?.('加载文件失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, toast]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // Drag & drop + ESC close modals
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const handleDragOver = (e) => { e.preventDefault(); el.classList.add('drag-over'); };
    const handleDragLeave = () => el.classList.remove('drag-over');
    const handleDrop = (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleUploadFiles(e.dataTransfer.files);
    };
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('drop', handleDrop);
    return () => {
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('dragleave', handleDragLeave);
      el.removeEventListener('drop', handleDrop);
    };
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setPreviewFile(null);
        setEditingFile(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleUploadFiles = async (fileList) => {
    setUploading(true);
    let success = 0;
    for (const file of fileList) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('uploaded_by', user?.id || 1);
        formData.append('category', guessCategory(file.type, file.name));
        await api.uploadFile(formData);
        success++;
      } catch (e) {
        toast?.show?.(`${file.name} 上传失败`, 'error');
      }
    }
    setUploading(false);
    if (success > 0) toast?.show?.(`成功上传 ${success} 个文件`, 'success');
    fetchFiles();
  };

  const guessCategory = (mime, name) => {
    const lowerName = name.toLowerCase();
    if (mime?.startsWith('image/')) return 'image';
    if (lowerName.includes('论文') || lowerName.includes('paper')) return 'paper';
    if (mime?.includes('javascript') || mime?.includes('json') || lowerName.endsWith('.js') || lowerName.endsWith('.py') || lowerName.endsWith('.ts') || lowerName.endsWith('.java') || lowerName.endsWith('.cpp')) return 'code';
    if (mime?.includes('pdf') || mime?.includes('word') || mime?.includes('text') || lowerName.endsWith('.md') || lowerName.endsWith('.txt')) return 'document';
    return 'other';
  };

  const handleDelete = async (id) => {
    if (!confirm('确定删除此文件？')) return;
    try {
      await api.deleteFile(id);
      setFiles(prev => prev.filter(f => f.id !== id));
      toast?.show?.('已删除', 'success');
    } catch (e) {
      toast?.show?.('删除失败', 'error');
    }
  };

  const handleDownload = (id, name) => {
    const url = api.downloadFile(id);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  };

  const handleUpdate = async () => {
    if (!editingFile) return;
    try {
      await api.updateFile(editingFile.id, {
        original_name: editingFile.original_name,
        category: editingFile.category,
        tags: editingFile.tags,
        description: editingFile.description,
      });
      setFiles(prev => prev.map(f => f.id === editingFile.id ? { ...f, ...editingFile } : f));
      setEditingFile(null);
      toast?.show?.('更新成功', 'success');
    } catch (e) {
      toast?.show?.('更新失败', 'error');
    }
  };

  const filteredFiles = files.filter(f =>
    f.original_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.tags?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div ref={dropRef}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-500 flex items-center justify-center shadow-lg shadow-sky-200">
            <Folder className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">文件资料库</h1>
            <p className="text-xs text-slate-400">论文 · 代码 · 文档 · 图片</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>
              <Grid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>
              <List className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-500 hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-lg shadow-sky-200 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? '上传中...' : '上传文件'}
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleUploadFiles(e.target.files)} />
        </div>
      </div>

      {/* Drag drop zone hint */}
      <div className="card p-4 mb-4 border-dashed border-2 border-slate-200 text-center">
        <p className="text-xs text-slate-400">拖拽文件到此处上传，或点击右上角上传按钮</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        {categories.map(c => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => setActiveCategory(c.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                activeCategory === c.key ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-100'
              }`}
            >
              <Icon className="w-3 h-3" />
              {c.label}
            </button>
          );
        })}
        <div className="flex items-center bg-white rounded-xl border border-slate-100 shadow-sm px-3 py-1.5 ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索文件..."
            className="text-xs outline-none bg-transparent ml-1.5 w-24"
          />
          {searchQuery && <button onClick={() => setSearchQuery('')}><X className="w-3 h-3 text-slate-400" /></button>}
        </div>
      </div>

      {/* Files */}
      {loading ? (
        <div className={`grid gap-3 ${viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : ''}`}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card p-3 animate-pulse">
              <div className="h-16 bg-slate-100 rounded-lg mb-2" />
              <div className="h-3 bg-slate-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="card p-12 text-center">
          <Folder className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400 mb-3">暂无文件</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-500 hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            上传文件
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredFiles.map(file => {
            const Icon = getFileIcon(file.mime_type);
            const isImage = file.mime_type?.startsWith('image/');
            return (
              <div key={file.id} className="card p-3 group relative hover:shadow-md transition-shadow">
                <div
                  className="aspect-square rounded-lg bg-slate-50 mb-2 flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => isImage ? setPreviewFile(file) : handleDownload(file.id, file.original_name)}
                >
                  {isImage ? (
                    <img src={`/uploads/${file.path}`} alt={file.original_name} className="w-full h-full object-cover" />
                  ) : (
                    <Icon className="w-8 h-8 text-slate-300" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate" title={file.original_name}>{file.original_name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-slate-400">{formatSize(file.size)}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleDownload(file.id, file.original_name)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                        <Download className="w-3 h-3" />
                      </button>
                      <button onClick={() => setEditingFile({ ...file })} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                        <PenLine className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDelete(file.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-50/50">
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">文件</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">分类</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">大小</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">上传者</th>
              <th className="text-left px-4 py-2.5 font-semibold text-slate-500">日期</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-500">操作</th>
            </tr></thead>
            <tbody>
              {filteredFiles.map(file => {
                const Icon = getFileIcon(file.mime_type);
                return (
                  <tr key={file.id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-slate-700 truncate max-w-[120px]" title={file.original_name}>{file.original_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                        {categories.find(c => c.key === file.category)?.label || '其他'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{formatSize(file.size)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{file.uploader_name || '-'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{file.created_at?.split('T')[0]}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleDownload(file.id, file.original_name)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingFile({ ...file })} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                          <PenLine className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(file.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewFile && (
        <div className="modal-overlay" onClick={() => setPreviewFile(null)}>
          <div className="modal-panel max-w-3xl p-2" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-2 py-1 mb-2">
              <span className="text-sm font-medium text-slate-700">{previewFile.original_name}</span>
              <button onClick={() => setPreviewFile(null)} className="p-1 rounded hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <img src={`/uploads/${previewFile.path}`} alt={previewFile.original_name} className="w-full max-h-[70vh] object-contain rounded-lg" />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingFile && (
        <div className="modal-overlay" onClick={() => setEditingFile(null)}>
          <div className="modal-panel p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800 mb-3">编辑文件信息</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">文件名</label>
                <input value={editingFile.original_name} onChange={e => setEditingFile(p => ({ ...p, original_name: e.target.value }))} className="input text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">分类</label>
                <select value={editingFile.category} onChange={e => setEditingFile(p => ({ ...p, category: e.target.value }))} className="input text-sm">
                  {categories.filter(c => c.key !== 'all').map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">标签</label>
                <input value={editingFile.tags || ''} onChange={e => setEditingFile(p => ({ ...p, tags: e.target.value }))} className="input text-sm" placeholder="用逗号分隔" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">描述</label>
                <textarea value={editingFile.description || ''} onChange={e => setEditingFile(p => ({ ...p, description: e.target.value }))} className="input text-sm min-h-[60px] resize-none" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button onClick={handleUpdate} className="flex-1 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700">保存</button>
              <button onClick={() => setEditingFile(null)} className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
