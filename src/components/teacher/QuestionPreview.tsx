import { Card } from '@/components/ui/card';
import { Question } from '@/hooks/useQuestions';
import { CheckCircle } from 'lucide-react';
import { MediaDisplay } from '@/components/ui/media-display';

interface QuestionPreviewProps {
  question: Question;
  questionNumber: number;
}

export const QuestionPreview = ({ question, questionNumber }: QuestionPreviewProps) => {
  return (
    <Card className="question-bubble p-6 animate-fade-in">
      {/* Passage if exists */}
      {question.passage_text && !question.sub_question_label && (
        <div className="passage-bubble mb-6">
          {question.passage_title && (
            <h4 className="font-semibold text-lg mb-3 text-foreground">
              {question.passage_title}
            </h4>
          )}
          <div className="passage-text text-foreground/90">
            {question.passage_text}
          </div>
        </div>
      )}

      {/* Question */}
      <div className="mb-4">
        <p className="font-semibold text-foreground mb-2">
          Q{questionNumber}{question.sub_question_label && question.sub_question_label}.{' '}
          {question.question_text}
        </p>
        <p className="text-xs text-muted-foreground">
          [{question.marks} mark{question.marks !== 1 ? 's' : ''}]
        </p>
      </div>

      {/* Media */}
      {question.media_url && (
        <div className="mb-4">
          <MediaDisplay
            url={question.media_url}
            type={question.media_type}
            alt="Question media"
            size="lg"
          />
        </div>
      )}

      {/* Answer options based on type */}
      {question.question_type === 'mcq' && question.options && (
        <div className="space-y-3">
          {question.options.map((option, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const isCorrect = question.correct_answer === letter;
            return (
              <div
                key={idx}
                className={`answer-card ${isCorrect ? 'border-success bg-success/5' : ''}`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                    isCorrect ? 'border-success bg-success/10' : 'border-border'
                  }`}>
                    {isCorrect ? (
                      <CheckCircle className="h-4 w-4 text-success" />
                    ) : (
                      <span className="text-sm font-medium">{letter}</span>
                    )}
                  </div>
                  <span className="text-foreground">{option}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </Card>
  );
};
