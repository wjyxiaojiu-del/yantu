import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Upload, Eye, MessageSquare, Trash2, Sparkles, ChevronLeft, Send, X, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import api from '../api';
import { useToast } from '../components/Toast';
import { SkeletonTable } from '../components/Skeleton';

export default function Papers() {
  const navigate = useNavigate();
  const params = useParams();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [pdfData, setPdfData] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewContent, setReviewContent] = useState('');
  const [reviewSection, setReviewSection] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', author: '', abstract: '', keywords: '', file: null });
  const toast = useToast();

  const isMentor = false;

  const loadPapers = useCallback(async () => {
    try {
      setLoading(true);
      const params = `student_id=${user.id}`;
      const res = await api.getPapers(params);
      setPapers(res.papers || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [isMentor, user?.id]);

  useEffect(() => { loadPapers(); }, [loadPapers]);

  useEffect(() => {
    if (params.id) {
      loadPaperDetail(Number(params.id));
    }
  }, [params.id]);

  async function loadPaperDetail(id) {
    try {
      setLoading(true);
      const [paperRes, fileRes, reviewRes] = await Promise.all([
        api.getPaper(id),
        api.getPaperFile(id),
        api.getPaperReviews(id)
      ]);
      setSelectedPaper(paperRes.paper);
      setPdfData(fileRes.data);
      setReviews(reviewRes.reviews || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddReview() {
    if (!reviewContent.trim() || !selectedPaper) return;
    try {
      await api.addPaperReview(selectedPaper.id, { content: reviewContent, section: reviewSection });
      setReviewContent('');
      setReviewSection('');
      const r = await api.getPaperReviews(selectedPaper.id);
      setReviews(r.reviews || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!uploadForm.title || !uploadForm.file) return;
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        await api.uploadPaper({
          title: uploadForm.title,
          author: uploadForm.author,
          abstract: uploadForm.abstract,
          keywords: uploadForm.keywords,
          fileName: uploadForm.file.name,
          fileData: base64,
          fileSize: uploadForm.file.size,
          student_id: user.id
        });
        setShowUpload(false);
        setUploadForm({ title: '', author: '', abstract: '', keywords: '', file: null });
        loadPapers();
      };
      reader.readAsDataURL(uploadForm.file);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDelete(id) {
    if (!confirm('确定删除这篇论文吗？')) return;
    try {
      await api.deletePaper(id);
      loadPapers();
      if (selectedPaper?.id === id) {
        setSelectedPaper(null);
        setPdfData(null);
        setReviews([]);
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (selectedPaper) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={() => { setSelectedPaper(null); setPdfData(null); navigate('/papers'); }}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <ChevronLeft size={20} /> 返回列表
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* PDF 预览 */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-4 dark:text-white">{selectedPaper.title}</h2>
            {pdfData ? (
              <iframe
                src={`data:application/pdf;base64,${pdfData}`}
                className="w-full h-[700px] rounded border"
                title="PDF Preview"
              />
            ) : (
              <div className="h-96 flex items-center justify-center text-gray-400">加载中...</div>
            )}
          </div>

          {/* 批注与历史分析侧边栏 */}
          <div className="space-y-6">
            {selectedPaper.ai_summary && (
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className="text-purple-600" />
                  <h3 className="font-semibold text-purple-800 dark:text-purple-300">历史分析结果</h3>
                  <span className="ml-auto text-sm font-bold text-purple-600">{selectedPaper.ai_score}分</span>
                </div>
                <div className="text-sm text-purple-700 dark:text-purple-300 whitespace-pre-line">{selectedPaper.ai_summary}</div>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h3 className="font-semibold mb-3 dark:text-white flex items-center gap-2">
                <MessageSquare size={16} /> 批注与反馈
              </h3>
              <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4">
                {reviews.length === 0 && (
                  <p className="text-sm text-gray-400">暂无批注</p>
                )}
                {reviews.map(r => (
                  <div key={r.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-blue-600 dark:text-blue-400">{r.reviewer_name}</span>
                      <span className="text-gray-400 text-xs">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    {r.section && <div className="text-xs text-gray-500 mb-1">章节: {r.section}</div>}
                    <p className="text-gray-700 dark:text-gray-300">{r.content}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="章节/位置（可选）"
                  value={reviewSection}
                  onChange={e => setReviewSection(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <textarea
                  placeholder="输入批注内容..."
                  value={reviewContent}
                  onChange={e => setReviewContent(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm h-20 resize-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <button onClick={handleAddReview} disabled={!reviewContent.trim()}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1">
                  <Send size={14} /> 提交批注
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-white">我的论文</h1>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Upload size={18} /> 上传论文
        </button>
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={7} />
      ) : papers.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400">暂无论文</h3>
          <p className="text-gray-400 mt-1">点击右上角上传论文</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-300">标题</th>
                {isMentor && <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-300">学生</th>}
                <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-300">版本</th>
                <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-300">状态</th>
                <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-300">历史评分</th>
                <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-300">更新日期</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {papers.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 dark:text-white">
                    <div className="font-medium">{p.title}</div>
                    <div className="text-gray-400 text-xs">{p.author || '未知作者'}</div>
                  </td>
                  {isMentor && <td className="px-4 py-3 dark:text-white">{p.student_name}</td>}
                  <td className="px-4 py-3 dark:text-white">v{p.version}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                      p.status === 'reviewed' ? 'bg-blue-100 text-blue-600' :
                      p.status === 'approved' ? 'bg-green-100 text-green-600' :
                      'bg-yellow-100 text-yellow-600'
                    }`}>
                      {p.status === 'draft' && <AlertCircle size={12} />}
                      {p.status === 'reviewed' && <MessageSquare size={12} />}
                      {p.status === 'approved' && <CheckCircle size={12} />}
                      {p.status === 'draft' ? '草稿' : p.status === 'reviewed' ? '已批注' : p.status === 'approved' ? '已通过' : p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.ai_score ? (
                      <span className={`font-bold ${p.ai_score >= 85 ? 'text-green-600' : p.ai_score >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {p.ai_score}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(p.updated_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => { navigate(`/papers/${p.id}`); }}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="查看">
                        <Eye size={16} />
                      </button>
                      {isMentor && (
                        <button onClick={() => handleDelete(p.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="删除">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 上传弹窗 */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold dark:text-white">上传论文</h2>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">论文标题 *</label>
                <input required value={uploadForm.title} onChange={e => setUploadForm({ ...uploadForm, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">作者</label>
                <input value={uploadForm.author} onChange={e => setUploadForm({ ...uploadForm, author: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">摘要</label>
                <textarea value={uploadForm.abstract} onChange={e => setUploadForm({ ...uploadForm, abstract: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg h-20 resize-none dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">关键词</label>
                <input value={uploadForm.keywords} onChange={e => setUploadForm({ ...uploadForm, keywords: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">PDF 文件 *</label>
                <input type="file" accept=".pdf" required
                  onChange={e => setUploadForm({ ...uploadForm, file: e.target.files[0] })}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowUpload(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
                <button type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">上传</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
